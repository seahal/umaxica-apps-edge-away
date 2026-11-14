# umaxica-apps-edge-away

Cushion page for the Umaxica project: the interstitial page shown before a user
leaves for an external site.

## Status

The local Away interstitial is implemented. `GET /?at=<JWT>` verifies the
Away-specific PS256 request contract, validates the destination, and renders a
confirmation page. A bare `/` redirects to `/about`, which explains the service
using the Jump reading-page design. Confirmation and error pages share Jump's
compact splash-card layout, information icon, and `UMAXICA (NET)` title branding.
Temporary failures and rate limits offer a reload action. Destination
confirmation remains explicit. The Worker also serves `GET /health`. Rails
issuance, caller migration, and production deployment remain separate work; see the
[Away implementation contract](plans/2026-11-12-away-implementation-contract.md).
The tooling and CI were ported from jump's engineering baseline without Jump's
application code, keys, or internal destination registry.

## Layout

- `src/index.ts` — the Hono app (`createApp`).
- `src/cloudflare.ts` — the Cloudflare Workers entry point.
- `src/config/issuers.ts` — Away's independent static issuer trust list.
- `src/core/` — token verification, JWKS handling, URL policy, security
  headers, and interstitial rendering.
- `test/` — Vitest unit tests (`*.test.ts`).
- `e2e/` — Playwright tests (`*.spec.ts`) and the Node server they run against.
- `scripts/test-worker.mjs` — runs the bundled Worker in workerd via Miniflare.
  Reads the entry point, compatibility date, and flags from `wrangler.jsonc`;
  requests are dispatched locally without fetching the public Worker.
- `public/` — static assets served through the Worker with security headers.
- `wrangler.jsonc` — Worker configuration.
- `.github/` — CI workflow, shared pnpm setup action, and Dependabot.
- `adr/` — architecture proposals and service responsibility boundaries.
- `plans/` — implementation plans.
- `memos/` — dated investigation notes; evidence, not decisions.
- `evidence/` — concise records of completed verification and security review.

## Development

Node and pnpm are pinned in `mise.toml`. Run `mise trust` once for this
repository, then `mise install` to install the pinned tools.

Requires exactly Node `26.13.1` and pnpm `12.18.0` (`engines` in
`package.json`); a different pnpm version fails instead of switching. With mise,
prefix commands with `mise exec node@26.13.1 pnpm@12.18.0 --`.

```sh
pnpm install                  # CI uses --frozen-lockfile
pnpm run cloudflare:dev       # local Worker on port 5210
pnpm run format:check         # oxfmt (pnpm run format to fix)
pnpm run lint:check           # oxlint (pnpm run lint to fix)
pnpm run types:generate       # generate worker-configuration.d.ts locally
pnpm run types:check          # check generated types without rewriting them
pnpm run typecheck
pnpm run test                 # Vitest
pnpm run test:cov             # Vitest with the 99% coverage threshold
pnpm run test:worker          # workerd runtime check
pnpm exec playwright install chromium
pnpm run test:e2e             # Playwright
pnpm run cloudflare:check     # wrangler deploy --dry-run
pnpm exec knip
pnpm audit --audit-level=high
```

CI generates Worker types from `wrangler.jsonc`, checks the generated file,
then runs TypeScript against those types. Run `types:generate` before local
type checking. The generated file is not currently committed, so this does
not detect stale committed types.

## EDGE Family

This repository is one of several split out of edge:

- [umaxica-apps-edge](https://github.com/seahal/umaxica-apps-edge) — the
  original edge monorepo on Cloudflare Workers that the others split from.
- [umaxica-apps-jump](https://github.com/seahal/umaxica-apps-jump) — controls
  the Umaxica TLD apexes, keeping open-redirect defense in its own deployment.
- [umaxica-apps-edge-core](https://github.com/seahal/umaxica-apps-edge-core) —
  future home of the TanStack Start cores once they outgrow edge; created but
  not yet populated.
- **umaxica-apps-edge-away** (this repository) — planned standalone system for
  the outbound cushion (interstitial) pages being retired from jump.

## Relationship to jump

Jump has begun preparing to retire its external destination capability and
remain an internal-only trust broker. Away independently owns outbound URL
validation and confirmation. External callers select Away directly; no Jump
forwarding, approval token or RT exchange is required.

The intended cushion behavior may also handle internal destination URLs under
Away's own validation and confirmation rules. That does not grant Jump's
internal trust guarantees: Away must not implement Jump's issuer registry,
internal origin graph, trust brokering or internal RT issuance/verification.
URL validation and open-redirect defense remain necessary in Away.

Away's outbound open-redirect defense and interstitial now run locally under
Away's own token and destination rules. The implementation does not issue or
verify Jump return tokens and does not forward automatically. Rails must adopt
the Away request contract before callers can use it; that integration and
production release are not part of this implementation. See [ADR 0001](adr/0001-independent-away-responsibility.md),
the [accepted design](plans/2026-11-10-away-interstitial-design.md), and the
[implementation contract](plans/2026-11-12-away-implementation-contract.md).

## Worker rate limit

`AWAY_RATE_LIMITER` limits token-bearing `GET /` requests to 600 per 60 seconds
per `CF-Connecting-IP` and Cloudflare location, before token verification.
Cloudflare's counters are approximate; shared-IP users share the allowance.
Bare `/`, `/about`, health and assets are outside this token-entry limit.
Excess requests receive secure localized HTML with 429 and `Retry-After: 60`.
Missing bindings and limiter timeouts fail closed with 503; a configured
limiter's call exception is logged without request data and fails open, matching
Jump's availability policy. The limiter call is bounded to one second.

Namespace `521000` is reserved locally for Away, separate from Jump's namespaces.
Confirm it is unused elsewhere in the target Cloudflare account before rollout.
No remote namespace or deployment was created by this implementation.

Toolchain: Vite Plus 1.5.0 runs formatting, linting, and unit tests through
`pnpm run format`, `pnpm run lint:check`, and `pnpm run test:cov`. Configuration
is consolidated in `vite.config.ts`. Node and pnpm remain managed by mise.
