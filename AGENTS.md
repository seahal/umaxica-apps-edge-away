# Repository Guidelines

## Project Structure & Module Organization

`umaxica-apps-edge-away` is the cushion page for the Umaxica project, built as
a Hono app on Cloudflare Workers. `README.md` documents the directory layout;
keep it current when adding directories.

- `src/`: application code. `src/index.ts` builds the app, `src/cloudflare.ts`
  is the Worker entry point.
- `test/`: Vitest unit tests, named `*.test.ts`.
- `e2e/`: Playwright tests, named `*.spec.ts`, plus `e2e/server.ts`.
- `scripts/`: Node scripts run through `package.json`.

The tooling was ported from the neighboring jump repository. Jump's application
code, keys, JWKS, and registry were deliberately not ported; do not copy them in
without a decision recorded for away.

## Build, Test, and Development Commands

- Use pnpm exclusively for dependency management and task execution.
- Install with `pnpm install --frozen-lockfile` in CI and `pnpm install` when
  intentionally updating the lockfile. Commit `pnpm-lock.yaml`.
- Run tools through `package.json` scripts (`pnpm run <script>`) or
  `pnpm exec <binary>`.
- Do not use npm, Yarn, or Corepack.
- Node and pnpm versions are pinned exactly in `package.json`; a mismatched pnpm
  fails rather than switching.

Before handoff, run:

- `pnpm run format:check`
- `pnpm run lint:check`
- `pnpm run typecheck`
- `pnpm run test:cov`

`README.md` lists the remaining commands (`test:worker`, `test:e2e`,
`cloudflare:check`, `knip`, `audit`), which CI also runs.

## Coding Style & Naming Conventions

oxfmt (`.oxfmtrc.json`) and oxlint (`.oxlintrc.json`) define the style: two
spaces, single quotes, semicolons, 100 columns for code and 80 for Markdown.
TypeScript is strict (`tsconfig.json`). Use descriptive filenames.

Follow YAGNI: implement only current requirements and avoid speculative
abstractions.

## Testing Guidelines

Vitest enforces 99% coverage of `src/**` (`vitest.config.ts`). Add unit tests
under `test/` with executable behavior, and Playwright tests under `e2e/` for
behavior visible over HTTP. Import `describe`, `it`, and `expect` from `vitest`
explicitly.

## Commit & Pull Request Guidelines

Use concise, imperative subjects, such as `Add cushion page layout`, and keep
commits focused.

Pull requests should explain the purpose, summarize changes, link relevant
issues, and state validation performed or unavailable. Include screenshots for
visible page changes once a UI exists.

## Security & Configuration

Never commit credentials or real environment values. `.gitignore` excludes
`.env`, `.env.*`, and `.dev.vars*` while allowing `.env.example`; use that file
only for safe placeholders and document required variables when configuration
is introduced. Rate-limit namespace IDs, keys, key IDs, and JWKS must be newly
issued for away, never reused from jump.
