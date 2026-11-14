# Away Implementation Evidence (2026-11-12)

## Scope

Owner authorized local Away implementation. The receiver contract is recorded
in `plans/2026-11-12-away-implementation-contract.md`. No deployment, DNS,
secret, Rails, or caller changes were made.

## Validation

All commands ran with pnpm 12.0.0. This checkout used Node 24.22.2; the
repository pins 24.20.0. Installing the pinned Node version was blocked by the
environment's read-only mise directory, so results below are from 24.22.2.

| Check                                              | Result                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm run format:check`                            | Passed                                                                |
| `pnpm run lint:check`                              | Passed                                                                |
| `pnpm run types:generate` / `pnpm run types:check` | Passed                                                                |
| `pnpm run typecheck`                               | Passed                                                                |
| `pnpm run test:cov`                                | 143 tests passed; statements, branches, functions, and lines all 100% |
| `pnpm run test:worker`                             | Passed: workerd health and not-found contracts                        |
| `pnpm run test:e2e`                                | 2 tests passed                                                        |
| `pnpm run cloudflare:check`                        | Passed dry-run; no deployment                                         |
| `pnpm exec knip`                                   | Passed                                                                |
| `pnpm audit --audit-level=high`                    | Passed: no known vulnerabilities                                      |
| `git diff --check`                                 | Passed                                                                |

The initial audit found six high, ten moderate, and one low development
dependency advisories. The lockfile remediation updated Vite to 8.3.3, Vitest
and coverage-v8 to 5.0.3, and Miniflare to 5.20261104.0-beta. A subsequent
registry audit reported no known vulnerabilities.

## Security review

- Requests require a short-lived Away-specific PS256 JWT from a statically
  allowlisted issuer. The issuer and JWKS URL come from that list; tokens
  cannot select a network host. JWKS fetches are HTTPS-only, pinned to the
  issuer origin and fixed path, non-redirecting, size-limited, and time-limited.
- The destination must be HTTPS, is normalized before display, and is never
  fetched by Away. The page presents an explicit link and does not redirect.
  Common OAuth/OIDC endpoint paths and sensitive query names are rejected.
- Response bodies are non-cacheable and responses set `no-referrer`, a
  restrictive CSP, `nosniff`, frame denial, `noindex`, and HSTS. Application
  logs omit the token and full destination URL; Worker observability config
  redacts query strings.
- No high or critical application-code issue was found in this review. This is
  a code and dependency review, not a penetration test or production runtime
  audit.

## Remaining risks and integration work

- A valid token is a bearer credential in the query string and can be reused
  during its 30-second lifetime. Away requires `jti` but does not store or
  reject previously seen identifiers. Theft within that window permits the
  destination confirmation page to be reopened.
- OAuth/OIDC detection is a denylist heuristic. Issuers and callers must not
  use Away for authentication flows.
- Rails issuance and caller migration are not implemented. Production use must
  wait until those systems emit and consume this exact Away contract and their
  integration is verified.
- No Cloudflare deployment or production configuration was changed.
