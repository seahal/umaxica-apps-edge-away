import { describe, expect, it } from 'vite-plus/test';
import {
  MAX_TOKEN_LENGTH,
  TOKEN_TYP,
  parseCompactToken,
  validateClaim,
  verifySignature,
} from '../src/core/token_profile';
import { AwayError } from '../src/core/types';
import {
  AWAY,
  createTestKeyPair,
  defaultClaims,
  encodeJson,
  encodeBase64Url,
  ISSUER,
  NOW,
  signToken,
} from './support/away-jwt';

const issuer = { iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` };
const validHeader = { typ: TOKEN_TYP, alg: 'PS256', kid: 'issuer-key' };
const validClaims = defaultClaims();
const signaturePart = 'A'.repeat(512);
const tokenFor = (header: unknown, payload: unknown, signature = signaturePart) =>
  `${encodeJson(header)}.${encodeJson(payload)}.${signature}`;

describe('Away JWT profile', () => {
  it('parses the closed PS256 protected header and compact serialization', () => {
    const parsed = parseCompactToken(tokenFor(validHeader, validClaims));
    expect(parsed.kid).toBe('issuer-key');
    expect(parsed.unverified).toEqual(validClaims);
    expect(parsed.signed.length).toBeGreaterThan(0);
    expect(parsed.signature).toHaveLength(384);
  });

  it('rejects oversized and malformed compact tokens', () => {
    expect(() => parseCompactToken('a'.repeat(MAX_TOKEN_LENGTH + 1))).toThrow(AwayError);
    expect(() => parseCompactToken('a.b')).toThrow(AwayError);
    expect(() => parseCompactToken('a!.b.c')).toThrow(AwayError);
    expect(() => parseCompactToken('!@.e30.A'.repeat(80))).toThrow(AwayError);
    expect(() => parseCompactToken(`${encodeJson([])}.e30.${signaturePart}`)).toThrow(AwayError);
  });

  it.each([
    { header: { ...validHeader, crit: ['exp'] }, label: 'unknown header member' },
    { header: { ...validHeader, typ: 'JWT' }, label: 'wrong type' },
    { header: { ...validHeader, alg: 'RS256' }, label: 'wrong algorithm' },
    { header: { ...validHeader, kid: '' }, label: 'empty key id' },
    { header: { ...validHeader, kid: 'x'.repeat(129) }, label: 'long key id' },
    { header: { ...validHeader, kid: 'bad\u0085kid' }, label: 'control key id' },
  ])('rejects a header with $label', ({ header }) => {
    expect(() => parseCompactToken(tokenFor(header, validClaims))).toThrow(AwayError);
  });

  it('rejects a malformed header JSON object and an incorrect signature length', () => {
    const arrayHeader = `${encodeJson([])}.${encodeJson(validClaims)}.${signaturePart}`;
    expect(() => parseCompactToken(arrayHeader)).toThrow(AwayError);
    expect(() => parseCompactToken(tokenFor(validHeader, validClaims, 'A'.repeat(508)))).toThrow(
      AwayError,
    );
    const invalidJsonHeader = `${encodeJson('{')}.${encodeJson(validClaims)}.${signaturePart}`;
    expect(() => parseCompactToken(invalidJsonHeader)).toThrow(AwayError);
    const invalidUtf8Header = `${encodeBase64Url(Uint8Array.of(0xff))}.${encodeJson(validClaims)}.${signaturePart}`;
    expect(() => parseCompactToken(invalidUtf8Header)).toThrow(AwayError);
  });

  it('validates a correctly scoped navigation claim', () => {
    expect(validateClaim(validClaims, issuer, AWAY, NOW)).toEqual(validClaims);
  });

  it.each([
    { claims: { ...validClaims, extra: true }, label: 'unknown claim' },
    { claims: { ...validClaims, schema: 2 }, label: 'wrong schema' },
    { claims: { ...validClaims, iss: 'https://other.example' }, label: 'wrong issuer' },
    { claims: { ...validClaims, aud: 'https://other.example' }, label: 'wrong audience' },
    { claims: { ...validClaims, purpose: 'jump-navigation' }, label: 'wrong purpose' },
    { claims: { ...validClaims, iat: 'now' }, label: 'wrong issued-at type' },
    { claims: { ...validClaims, nbf: null }, label: 'wrong not-before type' },
    { claims: { ...validClaims, exp: 0 }, label: 'zero expiry' },
    { claims: { ...validClaims, jti: '' }, label: 'empty identifier' },
    { claims: { ...validClaims, jti: 'has space' }, label: 'identifier control range' },
    { claims: { ...validClaims, jti: 'x'.repeat(129) }, label: 'long identifier' },
    { claims: { ...validClaims, url: '' }, label: 'empty URL' },
    { claims: { ...validClaims, url: 'x'.repeat(2049) }, label: 'long URL' },
    { claims: { ...validClaims, url: 'https://example.com/\u0085' }, label: 'control URL' },
  ])('rejects a claim with $label', ({ claims }) => {
    expect(() => validateClaim(claims, issuer, AWAY, NOW)).toThrow(AwayError);
  });

  it('distinguishes expired tokens from invalid time claims', () => {
    expect(() => validateClaim({ ...validClaims, exp: NOW - 6 }, issuer, AWAY, NOW)).toThrow(
      expect.objectContaining({ code: 'expired' }),
    );
    for (const claims of [
      { ...validClaims, iat: NOW + 6 },
      { ...validClaims, nbf: NOW + 6 },
      { ...validClaims, exp: validClaims.iat },
      { ...validClaims, nbf: validClaims.exp + 1 },
      { ...validClaims, exp: validClaims.iat + 31 },
      { ...validClaims, iat: 4_102_444_801 },
    ]) {
      expect(() => validateClaim(claims, issuer, AWAY, NOW)).toThrow(AwayError);
    }
  });

  it('verifies RSA-PSS using the PS256 salt length', async () => {
    const pair = await createTestKeyPair();
    const token = await signToken(pair);
    const parsed = parseCompactToken(token);
    const key = await crypto.subtle.importKey(
      'jwk',
      pair.publicJwk as unknown as JsonWebKey,
      { name: 'RSA-PSS', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    expect(await verifySignature(key, parsed.signature, parsed.signed)).toBe(true);
    expect(await verifySignature(key, new Uint8Array(4), parsed.signed)).toBe(false);
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('wrong algorithm'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    await expect(verifySignature(hmacKey, parsed.signature, parsed.signed)).rejects.toMatchObject({
      code: 'invalid_signature',
    });
  });
});
