import { AwayError, type AwayClaim } from './types';

export const TOKEN_TYP = 'away-request+jwt';
export const TOKEN_PURPOSE = 'away-navigation';
export const MAX_TOKEN_LENGTH = 4096;
const MAX_URL_LENGTH = 2048;
const MAX_TTL_SECONDS = 30;
const CLOCK_SKEW_SECONDS = 5;
const MAX_JTI_LENGTH = 128;
const MAX_NUMERIC_DATE = 4_102_444_800;
const HEADER_MEMBERS = new Set(['alg', 'kid', 'typ']);
const CLAIM_MEMBERS = new Set([
  'schema',
  'iss',
  'aud',
  'purpose',
  'iat',
  'nbf',
  'exp',
  'jti',
  'url',
]);

export type TokenIssuer = { iss: string; jwks_uri: string };

export function parseCompactToken(value: string) {
  if (value.length > MAX_TOKEN_LENGTH) throw new AwayError('malformed', 'token too large');
  const parts = value.split('.');
  if (parts.length !== 3 || parts.some((part) => !isBase64Url(part)))
    throw new AwayError('malformed', 'compact token rejected');
  const [headerPart = '', payloadPart = '', signaturePart = ''] = parts;
  const header = decodeJsonObject(headerPart, 'invalid_header');
  for (const member of Object.keys(header))
    if (!HEADER_MEMBERS.has(member))
      throw new AwayError('invalid_header', 'header member rejected');
  if (
    header.typ !== TOKEN_TYP ||
    header.alg !== 'PS256' ||
    typeof header.kid !== 'string' ||
    header.kid.length === 0 ||
    header.kid.length > 128 ||
    hasControlCharacter(header.kid)
  )
    throw new AwayError('invalid_header', 'header profile rejected');
  if (signaturePart.length !== 512) throw new AwayError('malformed', 'signature size rejected');
  return {
    parts,
    kid: header.kid,
    unverified: decodeJsonObject(payloadPart, 'malformed'),
    signed: new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    signature: decodeBase64Url(signaturePart),
  };
}

export async function verifySignature(key: CryptoKey, signature: Uint8Array, signed: Uint8Array) {
  try {
    const signatureBuffer = new ArrayBuffer(signature.byteLength);
    new Uint8Array(signatureBuffer).set(signature);
    const signedBuffer = new ArrayBuffer(signed.byteLength);
    new Uint8Array(signedBuffer).set(signed);
    return await crypto.subtle.verify(
      { name: 'RSA-PSS', saltLength: 32 },
      key,
      signatureBuffer,
      signedBuffer,
    );
  } catch {
    throw new AwayError('invalid_signature', 'signature verification failed');
  }
}

export function validateClaim(
  value: Record<string, unknown>,
  issuer: TokenIssuer,
  audience: string,
  now: number,
): AwayClaim {
  if (Object.keys(value).some((member) => !CLAIM_MEMBERS.has(member)))
    throw new AwayError('invalid_claim', 'unknown claim rejected');
  if (
    value.schema !== 1 ||
    value.iss !== issuer.iss ||
    value.aud !== audience ||
    value.purpose !== TOKEN_PURPOSE ||
    !isNumericDate(value.iat) ||
    !isNumericDate(value.nbf) ||
    !isNumericDate(value.exp) ||
    typeof value.jti !== 'string' ||
    !/^[\x21-\x7e]+$/.test(value.jti) ||
    value.jti.length > MAX_JTI_LENGTH ||
    typeof value.url !== 'string' ||
    value.url.length === 0 ||
    value.url.length > MAX_URL_LENGTH ||
    hasControlCharacter(value.url)
  )
    throw new AwayError('invalid_claim', 'claim profile rejected');
  if (value.exp < now - CLOCK_SKEW_SECONDS) throw new AwayError('expired', 'token expired');
  if (
    value.iat > now + CLOCK_SKEW_SECONDS ||
    value.nbf > now + CLOCK_SKEW_SECONDS ||
    value.exp <= value.iat ||
    value.nbf > value.exp ||
    value.exp - value.iat > MAX_TTL_SECONDS
  )
    throw new AwayError('invalid_claim', 'token time claims rejected');
  return value as AwayClaim;
}

function isNumericDate(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= MAX_NUMERIC_DATE
  );
}

function isBase64Url(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value) && value.length % 4 !== 1;
}

function decodeJsonObject(value: string, code: 'malformed' | 'invalid_header') {
  let decoded: unknown;
  try {
    const bytes = decodeBase64Url(value);
    decoded = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
    ) as unknown;
  } catch {
    throw new AwayError(code, 'json decode failed');
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded))
    throw new AwayError(code, 'json object required');
  return decoded as Record<string, unknown>;
}

function decodeBase64Url(value: string) {
  const standard = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(standard + '='.repeat((4 - (standard.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}
