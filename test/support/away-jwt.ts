import { TOKEN_PURPOSE, TOKEN_TYP } from '../../src/core/token_profile';

export const ISSUER = 'https://issuer.example.com';
export const AWAY = 'https://away.example.com';
export const NOW = 1_800_000_000;
const encoder = new TextEncoder();

export type TestKeyPair = { privateKey: CryptoKey; publicJwk: Record<string, unknown> };

export async function createTestKeyPair(): Promise<TestKeyPair> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSA-PSS',
      modulusLength: 3072,
      publicExponent: Uint8Array.of(1, 0, 1),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as unknown as Record<
    string,
    unknown
  >;
  return {
    privateKey: pair.privateKey,
    publicJwk: { ...publicJwk, kid: 'issuer-key', alg: 'PS256', use: 'sig' },
  };
}

export function defaultClaims(overrides: Record<string, unknown> = {}) {
  return {
    schema: 1,
    iss: ISSUER,
    aud: AWAY,
    purpose: TOKEN_PURPOSE,
    iat: NOW - 1,
    nbf: NOW - 1,
    exp: NOW + 20,
    jti: 'test-navigation-id',
    url: 'https://example.com/leave?source=test',
    ...overrides,
  };
}

export async function signToken(
  pair: TestKeyPair,
  claims: Record<string, unknown> = defaultClaims(),
  header: Record<string, unknown> = { typ: TOKEN_TYP, alg: 'PS256', kid: 'issuer-key' },
) {
  const protectedPart = encodeJson(header);
  const payloadPart = encodeJson(claims);
  const input = `${protectedPart}.${payloadPart}`;
  const signature = await crypto.subtle.sign(
    { name: 'RSA-PSS', saltLength: 32 },
    pair.privateKey,
    encoder.encode(input),
  );
  return `${input}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export function encodeJson(value: unknown) {
  return encodeBase64Url(encoder.encode(JSON.stringify(value)));
}

export function encodeBase64Url(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
