import { AwayError, type IssuerKeys } from './types';

const MAX_ISSUER_JWKS_KEYS = 4;
const MAX_KID_LENGTH = 128;
const ALLOWED_JWK_FIELDS = new Set(['alg', 'e', 'ext', 'key_ops', 'kid', 'kty', 'n', 'use']);
const PRIVATE_JWK_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'] as const;

export function isValidKid(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_KID_LENGTH)
    return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false;
  }
  return true;
}

export async function importIssuerJwks(value: unknown): Promise<IssuerKeys> {
  if (!isRecord(value) || !Array.isArray(value.keys)) throw rejected('jwks shape rejected');
  const entries: unknown[] = value.keys;
  if (entries.length === 0 || entries.length > MAX_ISSUER_JWKS_KEYS)
    throw rejected('jwks key count rejected');

  const keys = new Map<string, CryptoKey>();
  for (const candidate of entries) {
    if (!isRecord(candidate)) throw rejected('jwk shape rejected');
    if (PRIVATE_JWK_FIELDS.some((field) => Object.hasOwn(candidate, field)))
      throw rejected('private jwk material rejected');
    if (Object.keys(candidate).some((field) => !ALLOWED_JWK_FIELDS.has(field)))
      throw rejected('jwk member rejected');
    if (
      candidate.alg !== 'PS256' ||
      candidate.kty !== 'RSA' ||
      candidate.e !== 'AQAB' ||
      candidate.use !== 'sig' ||
      (candidate.ext !== undefined && candidate.ext !== true) ||
      !isValidKid(candidate.kid) ||
      typeof candidate.n !== 'string' ||
      !/^[A-Za-z0-9_-]{512}$/.test(candidate.n) ||
      (candidate.key_ops !== undefined &&
        (!Array.isArray(candidate.key_ops) ||
          candidate.key_ops.length !== 1 ||
          candidate.key_ops[0] !== 'verify'))
    )
      throw rejected('jwk profile rejected');
    if (keys.has(candidate.kid)) throw rejected('duplicate kid rejected');

    const modulus = decodeBase64Url(candidate.n);
    const modulusView = new DataView(modulus.buffer, modulus.byteOffset, modulus.byteLength);
    if (
      modulus.byteLength !== 384 ||
      (modulusView.getUint8(0) & 0x80) === 0 ||
      (modulusView.getUint8(383) & 1) === 0
    )
      throw rejected('rsa modulus size rejected');
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'RSA', n: candidate.n, e: candidate.e, alg: 'PS256', ext: true },
        { name: 'RSA-PSS', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      keys.set(candidate.kid, key);
    } catch {
      throw rejected('jwk import rejected');
    }
  }
  return keys;
}

function decodeBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function rejected(message: string) {
  return new AwayError('jwks_bad_gateway', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
