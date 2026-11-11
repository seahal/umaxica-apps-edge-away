import { importIssuerJwks } from './issuer_jwks';
import { AwayError, type IssuerConfig, type IssuerKeys } from './types';

export type FetchJwks = (issuer: IssuerConfig, signal?: AbortSignal) => Promise<unknown>;

type CachedIssuer = {
  keys?: IssuerKeys;
  expiresAt: number;
  outageUntil: number;
  badDocumentUntil: number;
  forcedRefreshAt: number;
  inFlight?: Promise<IssuerKeys>;
};

/** Isolate-local cache; state is bounded by the statically configured issuer list. */
export class JwksCache {
  private readonly entries = new Map<string, CachedIssuer>();

  constructor(
    private readonly fetchJwks: FetchJwks,
    private readonly ttlMs = 30_000,
    private readonly negativeTtlMs = 30_000,
    private readonly forcedRefreshCooldownMs = 10_000,
  ) {}

  async getKey(issuer: IssuerConfig, kid: string, forceRefresh = false, signal?: AbortSignal) {
    const cache = this.entry(issuer);
    let keys = await this.getSet(issuer, cache, forceRefresh, signal);
    let key = keys.get(kid);
    if (!key && !forceRefresh) {
      keys = await this.getSet(issuer, cache, true, signal);
      key = keys.get(kid);
    }
    if (!key) throw new AwayError('invalid_signature', 'kid not found');
    return key;
  }

  private entry(issuer: IssuerConfig) {
    let entry = this.entries.get(issuer.iss);
    if (!entry) {
      entry = { expiresAt: 0, outageUntil: 0, badDocumentUntil: 0, forcedRefreshAt: 0 };
      this.entries.set(issuer.iss, entry);
    }
    return entry;
  }

  private async getSet(
    issuer: IssuerConfig,
    entry: CachedIssuer,
    forceRefresh: boolean,
    signal?: AbortSignal,
  ): Promise<IssuerKeys> {
    if (signal?.aborted) throw new AwayError('jwks_unavailable', 'request aborted');
    const now = Date.now();
    if (!forceRefresh && entry.keys && entry.expiresAt > now) return entry.keys;
    if (entry.outageUntil > now)
      throw new AwayError('jwks_unavailable', 'issuer jwks negative cached');
    if (entry.badDocumentUntil > now)
      throw new AwayError('jwks_bad_gateway', 'issuer jwks rejected recently');
    if (forceRefresh && entry.keys && entry.expiresAt > now && entry.forcedRefreshAt > now)
      return entry.keys;
    if (entry.inFlight) return waitForKeys(entry.inFlight, signal);
    if (forceRefresh) entry.forcedRefreshAt = now + this.forcedRefreshCooldownMs;

    // Shared fetching uses the fetcher timeout, never an individual caller signal.
    const loading = this.fetchJwks(issuer)
      .then(importIssuerJwks)
      .then((keys) => {
        entry.keys = keys;
        entry.expiresAt = Date.now() + this.ttlMs;
        entry.outageUntil = 0;
        entry.badDocumentUntil = 0;
        return keys;
      })
      .catch((error: unknown) => {
        const failure =
          error instanceof AwayError
            ? error
            : new AwayError('jwks_unavailable', 'issuer jwks request failed');
        if (failure.code === 'jwks_unavailable')
          entry.outageUntil = Date.now() + this.negativeTtlMs;
        else if (failure.code === 'jwks_bad_gateway')
          entry.badDocumentUntil = Date.now() + this.forcedRefreshCooldownMs;
        throw failure;
      });
    entry.inFlight = loading;
    const shared = loading.finally(() => {
      delete entry.inFlight;
    });
    entry.inFlight = shared;
    return waitForKeys(shared, signal);
  }
}

function waitForKeys(promise: Promise<IssuerKeys>, signal?: AbortSignal): Promise<IssuerKeys> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new AwayError('jwks_unavailable', 'request aborted'));
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (keys) => {
        cleanup();
        if (signal.aborted) abort();
        else resolve(keys);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}
