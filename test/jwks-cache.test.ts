import { describe, expect, it, vi } from 'vite-plus/test';
import { JwksCache, type FetchJwks } from '../src/core/jwks_cache';
import { AwayError } from '../src/core/types';
import { createTestKeyPair, ISSUER } from './support/away-jwt';

const issuer = { iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` };

describe('JWKS cache', () => {
  it('caches a successful keyset and coalesces simultaneous requests', async () => {
    const pair = await createTestKeyPair();
    let calls = 0;
    let finish: (value: unknown) => void = () => {};
    const pending = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    const fetchJwks: FetchJwks = async () => {
      calls += 1;
      return pending;
    };
    const cache = new JwksCache(fetchJwks);
    const first = cache.getKey(issuer, 'issuer-key');
    const second = cache.getKey(issuer, 'issuer-key');
    finish({ keys: [pair.publicJwk] });
    const [firstKey, secondKey] = await Promise.all([first, second]);
    expect(firstKey).toBe(secondKey);
    expect(calls).toBe(1);
    expect(await cache.getKey(issuer, 'issuer-key')).toBe(firstKey);
  });

  it('keeps shared fetching and cached keys independent of a caller abort', async () => {
    const pair = await createTestKeyPair();
    let finish!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    const fetchJwks = vi.fn<FetchJwks>(async (_issuer, signal) => {
      signal?.addEventListener('abort', () => {
        throw new Error('shared fetch aborted');
      });
      return pending;
    });
    const cache = new JwksCache(fetchJwks);
    const controller = new AbortController();
    const first = cache.getKey(issuer, 'issuer-key', false, controller.signal);
    const second = cache.getKey(issuer, 'issuer-key');
    controller.abort();
    await expect(first).rejects.toMatchObject({ code: 'jwks_unavailable' });
    const later = cache.getKey(issuer, 'issuer-key');
    finish({ keys: [pair.publicJwk] });
    const key = await second;
    expect(await later).toBe(key);
    expect(await cache.getKey(issuer, 'issuer-key')).toBe(key);
    expect(fetchJwks).toHaveBeenCalledExactlyOnceWith(issuer);
  });

  it('observes a caller abort that races with joining a shared fetch', async () => {
    const pair = await createTestKeyPair();
    let finish!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    const cache = new JwksCache(async () => pending);
    const shared = cache.getKey(issuer, 'issuer-key');
    let reads = 0;
    const signal = {
      get aborted() {
        reads += 1;
        return reads > 1;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal;

    await expect(cache.getKey(issuer, 'issuer-key', false, signal)).rejects.toMatchObject({
      code: 'jwks_unavailable',
    });
    finish({ keys: [pair.publicJwk] });
    await expect(shared).resolves.toBeDefined();
    expect(signal.removeEventListener).toHaveBeenCalled();
  });

  it('refreshes once for an unknown key and bounds subsequent refreshes', async () => {
    const pair = await createTestKeyPair();
    let calls = 0;
    const cache = new JwksCache(async () => {
      calls += 1;
      return { keys: [pair.publicJwk] };
    });
    await expect(cache.getKey(issuer, 'missing')).rejects.toMatchObject({
      code: 'invalid_signature',
    });
    await expect(cache.getKey(issuer, 'missing')).rejects.toMatchObject({
      code: 'invalid_signature',
    });
    expect(calls).toBe(2);
  });

  it('negative-caches outages and malformed JWKS documents', async () => {
    let outageCalls = 0;
    const outage = new JwksCache(async () => {
      outageCalls += 1;
      throw new AwayError('jwks_unavailable');
    });
    await expect(outage.getKey(issuer, 'kid')).rejects.toMatchObject({ code: 'jwks_unavailable' });
    await expect(outage.getKey(issuer, 'kid')).rejects.toMatchObject({ code: 'jwks_unavailable' });
    expect(outageCalls).toBe(1);

    let badCalls = 0;
    const bad = new JwksCache(async () => {
      badCalls += 1;
      return { keys: [] };
    });
    await expect(bad.getKey(issuer, 'kid')).rejects.toMatchObject({ code: 'jwks_bad_gateway' });
    await expect(bad.getKey(issuer, 'kid')).rejects.toMatchObject({ code: 'jwks_bad_gateway' });
    expect(badCalls).toBe(1);
  });

  it('does not cache unrelated application errors as JWKS failures', async () => {
    let calls = 0;
    const cache = new JwksCache(async () => {
      calls += 1;
      throw new AwayError('invalid_claim');
    });
    await expect(cache.getKey(issuer, 'kid')).rejects.toMatchObject({ code: 'invalid_claim' });
    await expect(cache.getKey(issuer, 'kid')).rejects.toMatchObject({ code: 'invalid_claim' });
    expect(calls).toBe(2);
  });

  it('does not fetch when the request signal is already aborted', async () => {
    const fetchJwks = vi.fn<FetchJwks>(async () => ({ keys: [] }));
    const cache = new JwksCache(fetchJwks);
    const controller = new AbortController();
    controller.abort();
    await expect(cache.getKey(issuer, 'kid', false, controller.signal)).rejects.toMatchObject({
      code: 'jwks_unavailable',
    });
    expect(fetchJwks).not.toHaveBeenCalled();
  });
});
