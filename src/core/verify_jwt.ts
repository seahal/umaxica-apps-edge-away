import type { JwksCache } from './jwks_cache';
import { AwayError, type AwayClaim, type IssuerConfig } from './types';
import { parseCompactToken, validateClaim, verifySignature } from './token_profile';

export async function verifyAwayJwt(
  token: string,
  options: {
    issuers: ReadonlyMap<string, IssuerConfig>;
    jwksCache: JwksCache;
    audience: string;
    now: number;
    signal?: AbortSignal;
  },
): Promise<{ claim: AwayClaim; issuer: IssuerConfig; kid: string }> {
  const parsed = parseCompactToken(token);
  if (typeof parsed.unverified.iss !== 'string')
    throw new AwayError('invalid_claim', 'issuer missing');
  const issuer = options.issuers.get(parsed.unverified.iss);
  if (!issuer) throw new AwayError('invalid_claim', 'issuer not registered');

  let key = await options.jwksCache.getKey(issuer, parsed.kid, false, options.signal);
  let valid = await verifySignature(key, parsed.signature, parsed.signed);
  if (!valid) {
    key = await options.jwksCache.getKey(issuer, parsed.kid, true, options.signal);
    valid = await verifySignature(key, parsed.signature, parsed.signed);
  }
  if (!valid) throw new AwayError('invalid_signature', 'signature verification failed');
  const claim = validateClaim(parsed.unverified, issuer, options.audience, options.now);
  return { claim, issuer, kid: parsed.kid };
}
