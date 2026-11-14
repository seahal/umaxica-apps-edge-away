# Away Implementation Contract (2026-11-12)

Status: implemented locally for Away; Rails issuance, caller migration, and
production rollout remain pending. This records the Away-specific choices made
to implement the accepted design and the independent issuer trust list required
by `AGENTS.md`. It does not change any Rails or Jump runtime.

## Request token

- Entry: `GET /?at=<compact-JWT>` with exactly one literal `at` query parameter.
  No raw URL parameter, duplicate parameter, encoded key, or other query member
  is accepted.
- Protected header: exactly `typ`, `alg`, and `kid`; `typ` is
  `away-request+jwt`, and `alg` is `PS256`.
- Claims: exactly `schema: 1`, `iss`, `aud`, `purpose`, `iat`, `nbf`, `exp`,
  `jti`, and `url`. `purpose` is `away-navigation`; `aud` must equal the
  configured Away origin.
- `iat`, `nbf`, and `exp` are integer NumericDates. Maximum lifetime is 30
  seconds and clock tolerance is 5 seconds. The compact token is at most 4,096
  characters and `url` at most 2,048 characters.
- `jti` is required for issuer-side uniqueness and audit correlation. Tokens
  are reusable during their short lifetime; Away has no replay store or
  single-use semantics.
- A valid request returns an HTML page with a direct link. Away does not issue
  another token or send a `Location` header.

## Issuer trust and JWKS

- Away uses its own static issuer allowlist in `src/config/issuers.ts`. It is
  derived from canonical Rails issuer origins used by the Cosmos application
  surfaces. It is a list of signing authorities only: it contains no Jump
  destination edges, origin graph, gateway signer, or Jump runtime registry.
- Each issuer's JWKS URI is fixed to that issuer's origin plus
  `/.well-known/jwks.json`; request claims cannot choose a host or path.
- Accepted JWKs are public RSA-3072 PS256 verification keys with exponent
  65,537. Private material, unknown fields, duplicate `kid`, and sets with more
  than four keys are rejected. Fetches require HTTPS, do not follow redirects,
  cap the response at 64 KiB, and use a short isolate-local cache.
- Away does not sign tokens or publish a JWKS. Its accepted verification keys
  remain owned and published by each Rails issuer; no Jump key or Jump JWKS is
  reused.

## Destination and page

- Destinations must be HTTPS and normalize through the standard URL parser.
  Userinfo, fragments, control characters, malformed encodings, local or
  reserved hosts, non-public IP ranges, Jump, and Away itself are rejected.
- OAuth/OIDC endpoint paths and query keys commonly used for redirect URIs,
  codes, tokens, state, nonce, and authorization parameters are refused.
  Callers remain responsible for never sending authentication flows through
  Away.
- Away never fetches destinations. It displays the normalized full URL and host
  with its Unicode and ASCII/Punycode forms, when applicable. The primary action
  is a plain `noreferrer noopener` link; the return link goes to the validated
  issuer origin.
- Responses set `no-store`, `no-referrer`, a restrictive CSP, `nosniff`, frame
  denial, `noindex`, and HSTS. Logs contain only the issuer, destination host,
  and decision; token and full URL values are omitted.

## Integration boundary

The `at` parameter, `away-request+jwt` type, `purpose: away-navigation`, and
closed claim set are Away's receiver contract. The Rails issuer implementation
must emit that contract before production callers are switched. OAuth/OIDC
redirects remain outside Away. A successful local Worker build does not mean
DNS, secrets, caller behavior, or production deployment has been changed.

## Shared presentation (2026-11-14)

Away follows Jump's visual presentation: the compact splash card, information
icon, product reading layout, and `UMAXICA (NET)` page titles. Temporary errors
and rate limits expose an explicit reload link. This authorizes presentation
adaptation only; Away keeps its own request verification and destination rules.
The confirmation page retains the full destination and an explicit continue
link. Navigation remains script-free; the validated issuer link provides the
return action instead of Jump's history button.
