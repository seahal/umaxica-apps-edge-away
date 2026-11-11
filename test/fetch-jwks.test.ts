import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchIssuerJwks, MAX_JWKS_BYTES } from '../src/core/fetch_jwks';
import { AwayError, type IssuerConfig } from '../src/core/types';
import { ISSUER } from './support/away-jwt';

const issuer: IssuerConfig = { iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` };
const jsonResponse = (body: string | Uint8Array | null, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/json', ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe('JWKS fetch boundary', () => {
  it('fetches only the pinned HTTPS JWKS URI without redirects or caches', async () => {
    const fetchMock = vi.fn(async () => jsonResponse('{"keys":[]}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchIssuerJwks(issuer)).resolves.toEqual({ keys: [] });
    expect(fetchMock).toHaveBeenCalledWith(issuer.jwks_uri, {
      headers: { Accept: 'application/jwk-set+json, application/json' },
      cache: 'no-store',
      redirect: 'manual',
      signal: expect.any(AbortSignal),
    });
  });

  it('accepts the JWK Set media type and UTF-8 content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse('{"keys":[]}', {
          'content-type': 'application/jwk-set+json; charset="utf-8"',
        }),
      ),
    );
    await expect(fetchIssuerJwks(issuer)).resolves.toEqual({ keys: [] });
  });

  it('rejects an absent content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Uint8Array.of(123))),
    );
    await expect(fetchIssuerJwks(issuer)).rejects.toMatchObject({ code: 'jwks_bad_gateway' });
  });

  it.each([301, 302, 404])('rejects a non-success upstream response (%i)', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status })),
    );
    await expect(fetchIssuerJwks(issuer)).rejects.toMatchObject({ code: 'jwks_bad_gateway' });
  });

  it.each([429, 500, 503])('treats upstream status %i as temporary', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status })),
    );
    await expect(fetchIssuerJwks(issuer)).rejects.toMatchObject({ code: 'jwks_unavailable' });
  });

  it('rejects unsafe JWKS URLs before making a request', async () => {
    const fetchMock = vi.fn(async () => jsonResponse('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const invalid = [
      { ...issuer, jwks_uri: 'http://issuer.example.com/.well-known/jwks.json' },
      { ...issuer, jwks_uri: 'https://other.example.com/.well-known/jwks.json' },
      { ...issuer, jwks_uri: `${ISSUER}/different.json` },
      { ...issuer, jwks_uri: `${ISSUER}/.well-known/jwks.json?x=1` },
      { ...issuer, iss: 'not a URL' },
    ];
    for (const value of invalid) {
      await expect(fetchIssuerJwks(value)).rejects.toMatchObject({ code: 'jwks_bad_gateway' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an untrusted content type, a missing body and an oversized declaration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('{}', { 'content-type': 'text/html' })),
    );
    await expect(fetchIssuerJwks(issuer)).rejects.toBeInstanceOf(AwayError);

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    await expect(fetchIssuerJwks(issuer)).rejects.toBeInstanceOf(AwayError);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('{}', { 'content-length': String(MAX_JWKS_BYTES + 1) })),
    );
    await expect(fetchIssuerJwks(issuer)).rejects.toBeInstanceOf(AwayError);
  });

  it('caps streamed responses and rejects invalid UTF-8 and JSON', async () => {
    const tooLarge = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_JWKS_BYTES + 1));
      },
      cancel() {
        return Promise.reject(new Error('cancel rejected'));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(tooLarge, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    await expect(fetchIssuerJwks(issuer)).rejects.toBeInstanceOf(AwayError);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('{}', { 'content-length': 'unknown' })),
    );
    await expect(fetchIssuerJwks(issuer)).resolves.toEqual({});

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(Uint8Array.of(0xff))),
    );
    await expect(fetchIssuerJwks(issuer)).rejects.toBeInstanceOf(AwayError);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('{')),
    );
    await expect(fetchIssuerJwks(issuer)).rejects.toBeInstanceOf(AwayError);
  });

  it('stops before fetching when the caller has already aborted', async () => {
    const fetchMock = vi.fn(async () => jsonResponse('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(fetchIssuerJwks(issuer, controller.signal)).rejects.toMatchObject({
      code: 'jwks_unavailable',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps an upstream transport failure to a temporary error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('transport details');
      }),
    );
    await expect(fetchIssuerJwks(issuer)).rejects.toMatchObject({ code: 'jwks_unavailable' });
  });

  it('maps a failed body read to a temporary error and swallows cancel failures', async () => {
    const failedBody = new ReadableStream<Uint8Array>({
      pull() {
        return Promise.reject(new Error('body read failed'));
      },
      cancel() {
        return Promise.reject(new Error('cancel failed'));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(failedBody, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    await expect(fetchIssuerJwks(issuer)).rejects.toMatchObject({ code: 'jwks_unavailable' });
  });

  it('maps an upstream failure after caller cancellation to a temporary error', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        controller.abort();
        throw new Error('aborted transport');
      }),
    );
    await expect(fetchIssuerJwks(issuer, controller.signal)).rejects.toMatchObject({
      code: 'jwks_unavailable',
    });
  });

  it('cancels a response body when the caller aborts', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              cancel() {
                return Promise.reject(new Error('cancel rejected'));
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
      ),
    );
    const pending = fetchIssuerJwks(issuer, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'jwks_unavailable' });
  });

  it('stops a body stream that is still being read when the caller aborts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new ReadableStream<Uint8Array>(), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const controller = new AbortController();
    const pending = fetchIssuerJwks(issuer, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'jwks_unavailable' });
  });
});
