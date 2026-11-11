export type IssuerConfig = {
  iss: string;
  jwks_uri: string;
};

export type AwayClaim = {
  schema: 1;
  iss: string;
  aud: string;
  purpose: 'away-navigation';
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
  url: string;
};

export type IssuerKeys = ReadonlyMap<string, CryptoKey>;

export type AwayErrorCode =
  | 'malformed'
  | 'invalid_header'
  | 'invalid_signature'
  | 'invalid_claim'
  | 'expired'
  | 'invalid_url'
  | 'jwks_bad_gateway'
  | 'jwks_unavailable'
  | 'internal_error';

export class AwayError extends Error {
  constructor(
    readonly code: AwayErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'AwayError';
  }
}
