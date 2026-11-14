import { AwayError, type IssuerConfig } from './types';
import type { FetchJwks } from './jwks_cache';

export const MAX_JWKS_BYTES = 64 * 1024;
const JWKS_CONTENT_TYPE =
  /^application\/(?:jwk-set\+json|json)[ \t]*(?:;[ \t]*charset=(?:"utf-8"|utf-8)[ \t]*)?$/i;

export const fetchIssuerJwks: FetchJwks = async (issuer, parentSignal) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal?.addEventListener('abort', abort, { once: true });
  if (parentSignal?.aborted) controller.abort();
  const timer = setTimeout(abort, 1000);
  try {
    assertJwksUrl(issuer);
    if (controller.signal.aborted)
      throw new AwayError('jwks_unavailable', 'issuer jwks request aborted');
    const response = await fetch(issuer.jwks_uri, {
      headers: { Accept: 'application/jwk-set+json, application/json' },
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status !== 200) {
      if (response.status >= 500 || response.status === 429)
        throw new AwayError('jwks_unavailable', 'issuer jwks temporarily unavailable');
      throw new AwayError('jwks_bad_gateway', 'issuer jwks response rejected');
    }
    if (!JWKS_CONTENT_TYPE.test(response.headers.get('content-type') ?? ''))
      throw new AwayError('jwks_bad_gateway', 'issuer jwks content type rejected');
    const contentLength = response.headers.get('content-length');
    if (
      contentLength !== null &&
      /^\d+$/.test(contentLength) &&
      Number(contentLength) > MAX_JWKS_BYTES
    )
      throw new AwayError('jwks_bad_gateway', 'issuer jwks response too large');
    const body = await readBody(response, controller.signal);
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new AwayError('jwks_bad_gateway', 'issuer jwks json rejected');
    }
  } catch (error) {
    if (error instanceof AwayError) throw error;
    if (parentSignal?.aborted || controller.signal.aborted)
      throw new AwayError('jwks_unavailable', 'issuer jwks request timed out');
    throw new AwayError('jwks_unavailable', 'issuer jwks fetch failed');
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abort);
  }
};

function assertJwksUrl(issuer: IssuerConfig) {
  let issuerUrl: URL;
  let jwksUrl: URL;
  try {
    issuerUrl = new URL(issuer.iss);
    jwksUrl = new URL(issuer.jwks_uri);
  } catch {
    throw new AwayError('jwks_bad_gateway', 'issuer jwks url rejected');
  }
  if (
    issuerUrl.protocol !== 'https:' ||
    issuerUrl.origin !== issuer.iss ||
    jwksUrl.protocol !== 'https:' ||
    jwksUrl.origin !== issuerUrl.origin ||
    jwksUrl.pathname !== '/.well-known/jwks.json' ||
    jwksUrl.search ||
    jwksUrl.hash ||
    jwksUrl.username ||
    jwksUrl.password
  )
    throw new AwayError('jwks_bad_gateway', 'issuer jwks url contract rejected');
}

async function readBody(response: Response, signal: AbortSignal) {
  if (!response.body) throw new AwayError('jwks_bad_gateway', 'issuer jwks body missing');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    while (true) {
      if (signal.aborted) throw new AwayError('jwks_unavailable', 'issuer jwks request timed out');
      const { value, done } = await reader.read();
      if (signal.aborted) throw new AwayError('jwks_unavailable', 'issuer jwks request timed out');
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JWKS_BYTES) {
        void reader.cancel().catch(() => {});
        throw new AwayError('jwks_bad_gateway', 'issuer jwks response too large');
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(merged);
  } catch {
    throw new AwayError('jwks_bad_gateway', 'issuer jwks encoding rejected');
  }
}
