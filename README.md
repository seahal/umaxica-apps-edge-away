# umaxica-apps-edge-away

Cushion page for the Umaxica project: the interstitial page shown before a user
leaves for an external site.

## Status

Scaffold only. The Worker serves `GET /health` and nothing else; the cushion
page itself is not implemented yet. The tooling and CI were ported from jump's
engineering baseline, without jump's application code, keys, or registry.

## Layout

- `src/index.ts` — the Hono app (`createApp`).
- `src/cloudflare.ts` — the Cloudflare Workers entry point.
- `test/` — Vitest unit tests (`*.test.ts`).
- `e2e/` — Playwright tests (`*.spec.ts`) and the Node server they run against.
- `scripts/test-worker.mjs` — runs the bundled Worker in workerd via Miniflare.
  Reads the entry point, compatibility date, and flags from `wrangler.jsonc`;
  requests are dispatched locally without fetching the public Worker.
- `wrangler.jsonc` — Worker configuration.
- `.github/` — CI workflow, shared pnpm setup action, and Dependabot.
- `adr/` — architecture proposals and service responsibility boundaries.
- `plans/` — implementation plans.
- `memos/` — dated investigation notes; evidence, not decisions.

## Development

Requires exactly Node `24.20.0` and pnpm `12.0.0` (`engines` in
`package.json`); a different pnpm version fails instead of switching. With mise,
prefix commands with `mise exec node@24.20.0 pnpm@12.0.0 --`.

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

Implementation of Away's independent outbound open-redirect defense and cushion
page may now begin. The current runtime is still the health-only scaffold;
implementation permission does not mean the feature is implemented or deployed.
See [ADR 0001](adr/0001-independent-away-responsibility.md) and the
[implementation plan](plans/away-external-navigation.md).
