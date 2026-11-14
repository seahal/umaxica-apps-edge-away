import type { IssuerConfig } from '../core/types';

/** Away's own trust list; it does not include Jump's internal destination graph. */
const origins = [
  'https://auth.umaxica.app',
  'https://auth.umaxica.com',
  'https://auth.umaxica.org',
  'https://www.umaxica.app',
  'https://www.umaxica.com',
  'https://www.umaxica.org',
  'https://jp.umaxica.app',
  'https://jp.umaxica.com',
  'https://jp.umaxica.org',
  'https://www-jp.umaxica.app',
  'https://www-jp.umaxica.com',
  'https://www-jp.umaxica.org',
  'https://palm-jp.umaxica.app',
  'https://visa.umaxica.app',
  'https://visa.umaxica.org',
] as const;

export const ISSUERS: readonly IssuerConfig[] = origins.map((iss) => ({
  iss,
  jwks_uri: `${iss}/.well-known/jwks.json`,
}));
