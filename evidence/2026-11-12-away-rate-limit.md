# Away rate limiting

Added Away-only AWAY_RATE_LIMITER binding with locally selected namespace
521000 and a 600 requests / 60 seconds policy. Jump namespaces 520900 and
520901 were not reused. Account-wide uniqueness remains a rollout check.
Token-bearing GET / requests are checked by trusted Cloudflare client IP before
JWT parsing or JWKS fetching. Other public routes remain available.
Excess returns localized 429 HTML with Retry-After: 60 and security headers.
Missing/malformed bindings, malformed results and call timeout fail closed;
configured limiter call exceptions fail open with a coarse warning, matching
Jump's policy. Calls are independently bounded to one second.

Validation using mise Node 26.13.1 and pnpm 12.0.0: types:generate,
format:check, lint:check, typecheck, test:cov (158 tests; thresholds met),
test:worker and cloudflare:check passed. Unit tests exercise allowed/excess,
IPv4/IPv6, invalid client IP, missing binding, malformed result, exception,
timeout, and excluded public/non-GET routes. Dry run confirmed the rate-limit
binding. Workerd test covers health and not-found, not distributed counters.
No deployment or remote account change was performed.
