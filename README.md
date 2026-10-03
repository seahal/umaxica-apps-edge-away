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
  the outbound cushion (interstitial) pages that jump does not implement yet.

## Relationship to jump

jump decides whether a destination is allowed; away only displays the cushion
page. How away verifies jump's approval (for example, a signed token) is not
decided yet and should be recorded in an ADR before implementation.
