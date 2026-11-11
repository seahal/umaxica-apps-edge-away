import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import worker from '../src/cloudflare';
import { createApp } from '../src/index';
import {
  AWAY,
  defaultClaims,
  createTestKeyPair,
  ISSUER,
  NOW,
  signToken,
  type TestKeyPair,
} from './support/away-jwt';

describe('Away navigation interstitial', () => {
  let pair: TestKeyPair;
  let fetchCalls: number;
  let app: ReturnType<typeof createApp>;
  let consoleInfo: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    pair = await createTestKeyPair();
  });

  beforeEach(() => {
    fetchCalls = 0;
    app = createApp({
      serviceOrigin: AWAY,
      issuers: [{ iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` }],
      now: () => NOW,
      fetchJwks: async () => {
        fetchCalls += 1;
        return { keys: [pair.publicJwk] };
      },
    });
    consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterAll(() => consoleInfo.mockRestore());

  it('redirects a bare entry to the public about page without key lookup', async () => {
    const response = await app.request('/');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/about');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    for (const locale of ['ja', 'en']) {
      const about = await app.request('/about', { headers: { 'Accept-Language': locale } });
      expect(about.status).toBe(200);
      expect(await about.text()).toContain(
        locale === 'ja' ? 'UMAXICA Away について' : 'About UMAXICA Away',
      );
      expect(about.headers.get('cache-control')).toBe('no-store');
    }
    expect((await app.request('/assets/about.css')).status).toBe(200);
    expect(fetchCalls).toBe(0);
  });

  it('verifies a signed request and renders the exact normalized destination', async () => {
    const token = await signToken(
      pair,
      defaultClaims({ url: 'https://bücher.example.com/確認?q=1' }),
    );
    const response = await app.request(`/?at=${token}`, { headers: { 'Accept-Language': 'ja' } });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('別のサイトへ移動します');
    expect(html).toContain('bücher.example.com (xn--bcher-kva.example.com)');
    expect(html).toContain('https://xn--bcher-kva.example.com/%E7%A2%BA%E8%AA%8D?q=1');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain(`href="${ISSUER}"`);
    expect(html).not.toContain(token);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=63072000; includeSubDomains',
    );
  });

  it('renders English copy when Japanese is not preferred', async () => {
    const token = await signToken(pair);
    const response = await app.request(`/?at=${token}`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    expect(await response.text()).toContain('This site is not managed by UMAXICA');
  });

  it('rejects a raw URL query without fetching a keyset or showing its value', async () => {
    fetchCalls = 0;
    const response = await app.request('/?url=https%3A%2F%2Fevil.example');
    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).not.toContain('evil.example');
    expect(response.headers.get('location')).toBeNull();
    expect(fetchCalls).toBe(0);
  });

  it('rejects duplicated and oversized entry queries before key lookup', async () => {
    fetchCalls = 0;
    for (const path of ['/?at=a.b.c&at=a.b.c', `/?at=${'A'.repeat(4100)}`]) {
      const response = await app.request(path);
      expect(response.status).toBe(400);
    }
    expect(fetchCalls).toBe(0);
  });

  it('rejects invalid and expired tokens without disclosing the destination', async () => {
    const expired = await signToken(pair, defaultClaims({ exp: NOW - 20 }));
    const wrongAudience = await signToken(pair, defaultClaims({ aud: 'https://other.example' }));
    for (const token of [expired, wrongAudience]) {
      const response = await app.request(`/?at=${token}`);
      const html = await response.text();
      expect(response.status).toBe(400);
      expect(html).not.toContain('example.com');
      expect(response.headers.get('location')).toBeNull();
    }
  });

  it('rejects a signature failure after one bounded JWKS refresh', async () => {
    fetchCalls = 0;
    const valid = await signToken(pair);
    const damaged = `${valid.slice(0, -1)}${valid.endsWith('A') ? 'B' : 'A'}`;
    const response = await app.request(`/?at=${damaged}`);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('example.com');
    expect(fetchCalls).toBe(2);
    expect(response.headers.get('location')).toBeNull();
  });

  it('rejects destinations that do not satisfy Away policy', async () => {
    for (const url of ['http://example.com/', 'https://127.0.0.1/', 'https://jump.umaxica.net/']) {
      const token = await signToken(pair, defaultClaims({ url }));
      const response = await app.request(`/?at=${token}`);
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain(url);
    }
  });

  it('returns a safe temporary error when the issuer keyset is unavailable', async () => {
    const unavailable = createApp({
      serviceOrigin: AWAY,
      issuers: [{ iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` }],
      now: () => NOW,
      fetchJwks: async () => {
        throw new Error('contains no safe diagnostics');
      },
    });
    const token = await signToken(pair);
    const response = await unavailable.request(`/?at=${token}`);
    const html = await response.text();
    expect(response.status).toBe(503);
    expect(html).not.toContain('example.com');
    expect(html).not.toContain('contains no safe diagnostics');
  });

  it('returns a bad gateway when an issuer publishes an invalid keyset', async () => {
    const badJwks = createApp({
      serviceOrigin: AWAY,
      issuers: [{ iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` }],
      now: () => NOW,
      fetchJwks: async () => ({ keys: [] }),
    });
    const token = await signToken(pair);
    const response = await badJwks.request(`/?at=${token}`);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('example.com');
  });

  it('uses the wall clock when no test clock is configured', async () => {
    const now = Math.floor(Date.now() / 1000);
    const live = createApp({
      serviceOrigin: AWAY,
      issuers: [{ iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` }],
      fetchJwks: async () => ({ keys: [pair.publicJwk] }),
    });
    const token = await signToken(
      pair,
      defaultClaims({ iat: now - 1, nbf: now - 1, exp: now + 20 }),
    );
    const response = await live.request(`/?at=${token}`);
    expect(response.status).toBe(200);
  });

  it('returns a generic secure response when the route error handler is reached', async () => {
    consoleInfo.mockImplementationOnce(() => {
      throw new Error('unsafe diagnostic');
    });
    const unavailable = createApp({
      serviceOrigin: AWAY,
      issuers: [{ iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` }],
      now: () => NOW,
      fetchJwks: async () => {
        throw new Error('unsafe diagnostic');
      },
    });
    const token = await signToken(pair);
    const response = await unavailable.request(`/?at=${token}`);
    const html = await response.text();
    expect(response.status).toBe(500);
    expect(html).not.toContain('example.com');
    expect(html).not.toContain('unsafe diagnostic');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('keeps unexpected runtime errors generic', async () => {
    const brokenClock = createApp({
      serviceOrigin: AWAY,
      issuers: [{ iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` }],
      now: () => {
        throw new Error('private runtime detail');
      },
      fetchJwks: async () => ({ keys: [pair.publicJwk] }),
    });
    const token = await signToken(pair);
    const response = await brokenClock.request(`/?at=${token}`);
    const html = await response.text();
    expect(response.status).toBe(500);
    expect(html).not.toContain('private runtime detail');
    expect(response.headers.get('x-away-error')).toBe('internal_error');
  });

  it('rejects non-GET navigation methods and keeps health independent of JWKS', async () => {
    fetchCalls = 0;
    const method = await app.request('/?at=abc.def.ghi', { method: 'POST' });
    const health = await app.request('/health');
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('GET');
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'OK', service: 'away', version: '0.1.0' });
    expect(fetchCalls).toBe(0);
  });

  it('serves only the first-party stylesheet and secures not-found responses', async () => {
    const css = await app.request('/assets/away.css');
    const missing = await app.request('/not-found');
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toContain('text/css');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');
    expect(missing.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('serves configured static assets through the security middleware', async () => {
    const asset = vi.fn(
      async () => new Response('icon', { headers: { 'Content-Type': 'image/x-icon' } }),
    );
    const response = await app.request('/favicon.ico', {}, { ASSETS: { fetch: asset } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('icon');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(asset).toHaveBeenCalledTimes(1);
    expect((await app.request('/favicon.ico')).status).toBe(404);
  });

  it('keeps the Cloudflare worker entry point operational', async () => {
    const executionContext = {
      waitUntil() {},
      passThroughOnException() {},
    } as unknown as ExecutionContext;
    const response = await worker.fetch(new Request(`${AWAY}/health`), {}, executionContext);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
