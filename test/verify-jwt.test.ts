import { describe, expect, it, vi } from 'vitest';
import { JwksCache } from '../src/core/jwks_cache';
import { verifyAwayJwt } from '../src/core/verify_jwt';
import { AWAY, createTestKeyPair, defaultClaims, ISSUER, NOW, signToken } from './support/away-jwt';

describe('Away JWT issuer selection', () => {
  it('rejects a token without a string issuer before a JWKS lookup', async () => {
    const pair = await createTestKeyPair();
    const fetchJwks = vi.fn(async () => ({ keys: [] }));
    const token = await signToken(pair, defaultClaims({ iss: null }));
    await expect(
      verifyAwayJwt(token, {
        issuers: new Map([[ISSUER, { iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` }]]),
        jwksCache: new JwksCache(fetchJwks),
        audience: AWAY,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'invalid_claim' });
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  it('rejects an unregistered issuer before a JWKS lookup', async () => {
    const pair = await createTestKeyPair();
    const fetchJwks = vi.fn(async () => ({ keys: [] }));
    const token = await signToken(pair);
    await expect(
      verifyAwayJwt(token, {
        issuers: new Map(),
        jwksCache: new JwksCache(fetchJwks),
        audience: AWAY,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'invalid_claim' });
    expect(fetchJwks).not.toHaveBeenCalled();
  });
});
