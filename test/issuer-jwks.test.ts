import { describe, expect, it, vi } from 'vite-plus/test';
import { importIssuerJwks, isValidKid } from '../src/core/issuer_jwks';
import { AwayError } from '../src/core/types';
import { createTestKeyPair } from './support/away-jwt';

describe('issuer JWK validation', () => {
  it('imports one public RSA-3072 PS256 verification key', async () => {
    const pair = await createTestKeyPair();
    const keys = await importIssuerJwks({ keys: [pair.publicJwk] });
    expect(keys.size).toBe(1);
    expect(keys.has('issuer-key')).toBe(true);
  });

  it('validates key identifiers without normalization', () => {
    expect(isValidKid('kid-1')).toBe(true);
    expect(isValidKid('')).toBe(false);
    expect(isValidKid('x'.repeat(129))).toBe(false);
    expect(isValidKid('bad\u0085kid')).toBe(false);
    expect(isValidKid(null)).toBe(false);
  });

  it('rejects invalid set shapes and key counts', async () => {
    for (const value of [null, [], { keys: 'no' }, { keys: [] }, { keys: Array(5).fill({}) }]) {
      await expect(importIssuerJwks(value)).rejects.toMatchObject({
        code: 'jwks_bad_gateway',
      });
    }
    await expect(importIssuerJwks({ keys: [null] })).rejects.toBeInstanceOf(AwayError);
  });

  it('rejects private material, unsupported members and non-PS256 key profiles', async () => {
    const pair = await createTestKeyPair();
    for (const invalid of [
      { ...pair.publicJwk, d: 'private' },
      { ...pair.publicJwk, x5u: 'https://keys.example/key' },
      { ...pair.publicJwk, alg: 'RS256' },
      { ...pair.publicJwk, kty: 'EC' },
      { ...pair.publicJwk, e: 'AQABx' },
      { ...pair.publicJwk, use: 'enc' },
      { ...pair.publicJwk, kid: '' },
      { ...pair.publicJwk, key_ops: ['sign', 'verify'] },
    ]) {
      await expect(importIssuerJwks({ keys: [invalid] })).rejects.toBeInstanceOf(AwayError);
    }
  });

  it('rejects malformed RSA modulus sizes and duplicate key ids', async () => {
    const pair = await createTestKeyPair();
    await expect(
      importIssuerJwks({ keys: [{ ...pair.publicJwk, n: 'A'.repeat(512) }] }),
    ).rejects.toBeInstanceOf(AwayError);
    await expect(
      importIssuerJwks({ keys: [{ ...pair.publicJwk, n: 'g'.repeat(512) }] }),
    ).rejects.toBeInstanceOf(AwayError);
    await expect(
      importIssuerJwks({ keys: [pair.publicJwk, pair.publicJwk] }),
    ).rejects.toBeInstanceOf(AwayError);
  });

  it('maps a Web Crypto key import failure to a bad keyset', async () => {
    const pair = await createTestKeyPair();
    const importKey = vi
      .spyOn(crypto.subtle, 'importKey')
      .mockRejectedValue(new Error('import failed'));
    await expect(importIssuerJwks({ keys: [pair.publicJwk] })).rejects.toMatchObject({
      code: 'jwks_bad_gateway',
    });
    importKey.mockRestore();
  });
});
