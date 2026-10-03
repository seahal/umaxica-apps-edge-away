# Jump の engineering baseline を Away に移植する

## Context

Away には今 `README.md` / `AGENTS.md` / `LICENSE` / `.gitignore` と `pnpm init` 直後の `package.json` しかない。
隣の `../umaxica-apps-edge-jump` で動いている開発基盤(pnpm, TypeScript, Hono, Workers, Vitest, Playwright, oxc, knip, CI, Dependabot, gitleaks, Wrangler dry-run)を、Away の最初の scaffold として移す。
Jump の業務ロジック(`src/core/*`、鍵、JWKS、registry)は移さない。
Away 本体(URL validation 以降)は次のコミットから実装する。

Jump の実ファイルを読んだ結果、貼り付けの案から変える点が 6 つある(下の「貼り付け案との差分」)。

## 移植するもの

### そのままコピー(内容変更なし)

- `.oxfmtrc.json`, `.oxfmtignore`, `.oxlintrc.json`
- `tsconfig.json`(`jsx: hono/jsx` も残す。cushion page で使う)
- `vitest.config.ts`(coverage threshold 99% のまま)
- `playwright.config.ts`
- `knip.json`(entry は `src/cloudflare.ts`, `src/index.ts`, `e2e/server.ts`, `test/**/*.test.ts` で Away でも同じ)
- `pnpm-workspace.yaml`(`pmOnFail: error`, `ignoreScripts: true`, `minimumReleaseAge: 4320`, `allowBuilds`, workers-types の catalog)
- `.github/actions/pnpm-project/action.yml`
- `.github/workflows/integration.yaml`(7 ジョブとも Jump 固有の記述なし。knip は Jump と同じ `--include unlisted,unresolved,binaries` + `KNIP_DISABLE_RAW_TRANSFER=1`)
- `.github/dependabot.yml`
- `.npmrc`(`registry=https://npm.flatt.tech/`)
- `CLAUDE.md`(`@AGENTS.md` の 1 行)、`.claudeignore`、`.worktreeinclude`

### 書き換えて移植

- `package.json`: Jump の scripts / devDependencies / `engines` / `packageManager` を使い、次を変える。
  - `name: umaxica-apps-edge-away`, `version: 0.1.0`
  - `keys:generate` script を削除
  - `jose` を削除(scaffold では未使用。knip が落とす)
  - `cloudflare:dev` のポートを `5209` → `5210`
  - 今の `devEngines`(pnpm 12.8.1, `onFail: download`)と `main` / `license: ISC` 等は削除。pnpm は Jump と同じ `12.0.0`(hash 付き)に揃える
- `wrangler.jsonc`: 構造だけ移す。
  - `name: umaxica-apps-edge-away`, `main: src/cloudflare.ts`, `compatibility_date`, `nodejs_compat`
  - `version_metadata.binding: UMAXICA-APPS-EDGE-AWAY-VERSION`
  - `routes`: `away.umaxica.net`(`custom_domain: true`)、`workers_dev: false`
  - `observability` ブロックはそのまま(`redact_query_string: true` を含む。`?rt=` に触れたコメントだけ一般化)
  - 入れない: `assets`, `ratelimits`, `vars`(下記)
- `.gitignore`: Away の既存ファイルに Jump 側の差分だけ足す。`.wrangler`, `worker-configuration.d.ts`, `.dev.vars`, `.dev.vars.*`, `test-results/`, `playwright-report/`, `.claude/`, `.codex/`, `.vscode/`, `.idea`, `.DS_Store`, `package-lock.json`。`dev/core/...` や `app/post/...` など Jump にも残っている edge monorepo 由来のパスは入れない
- `e2e/server.ts`: `../test/app-fixture` ではなく `../src/index` の `createApp` を直接 import
- `scripts/test-worker.mjs`: Jump 版 267 行は JWT と production graph の検証なので、骨格(esbuild で `src/cloudflare.ts` を bundle → Miniflare で `dispatchFetch`)だけ残して `/health` の 200 と `redact_query_string` の設定確認に絞る

### Away 用に新規作成(Jump のコードはコピーしない)

- `src/index.ts`: `createApp()` が Hono app を返す。`GET /health` が `{ status: 'OK', service: 'away', version }` を返すだけ
- `src/cloudflare.ts`: `export default { fetch }` で `createApp().fetch` に渡すだけ
- `test/away.test.ts`: `/health` と未定義パスの 404
- `e2e/smoke.spec.ts`: `/health` の 200 と JSON
- `pnpm-lock.yaml`: `pnpm install` で生成

### ドキュメント更新

- `AGENTS.md`: 「tooling なし」の記述を実態に合わせる。Jump の `AGENTS.md` から pnpm workflow と YAGNI の節を取り込み、Evidence の節は入れない
- `README.md`: ディレクトリ構成と install / dev / build / test コマンドを追記(`AGENTS.md` の要求)。Status を「scaffold のみ」に更新

## 移植しないもの

- `src/core/*`, `src/config/registry.umaxica.ts`, `test/*`(fixtures 含む), `scripts/generate-jump-keypair.mjs`
- `wrangler.jsonc` の `UMAXICA_JUMP_*` vars、`ratelimits`(`namespace_id: 520900`)、`assets`
- `public/_headers`, `public/favicon.ico`(CSP の hash が Jump のページ用)
- `adr/`, `docs/`, `evidence/`, `plans/`, `DESIGN.md`, `test/evidence-layout.test.ts`
- `SECURITY.md`, `CONTRIBUTING.md`(Jump の契約と `evidence/` を前提にした文面。Away の契約が決まってから書く)
- `.github/copilot-instructions.md`(`AGENTS.md` の複製)、`.aiassistant/`
- `LICENSE`

## 貼り付け案との差分

1. `LICENSE` は移植しない。Jump は Apache-2.0、Away は MIT で別ライセンス。
2. `scripts/test-worker.mjs` が必要。貼り付けのツリーに `scripts/` がないが、`test:worker` と CI の `worker-runtime` ジョブはこのファイルを実行する。
3. `ratelimits` は scaffold に入れない。`AWAY_RATE_LIMITER` を参照するコードがまだなく、`namespace_id` も新規採番が要るため、rate limit を実装するコミットで足す。
4. `assets`(`./public`, `run_worker_first`)も入れない。`public/` を作らないので dry-run が落ちる。
5. pnpm のバージョンが食い違っている。Away の `package.json` は 12.8.1 + `onFail: download`、Jump は 12.0.0 + `pmOnFail: error`。Jump 側に揃える案にした。この端末の pnpm は 12.4.2、Node は 24.21.0 で、どちらの pin とも一致しないため、`pnpm install` が止まったら実行前に報告する。
6. `.npmrc` は Flatt の registry(`npm.flatt.tech`)を指す。Jump と同じ供給網ポリシーにする前提でコピーする。

## 確認が必要な前提

- ドメインは `away.umaxica.net`、dev ポートは `5210` と仮定した。違えば `wrangler.jsonc` と `package.json` の 2 か所を直す。
- コミットメッセージは `AGENTS.md` の規約(命令形、prefix なし)に合わせて `Bootstrap implementation environment from Jump baseline` とする。コミットは依頼があってから行う。

## Verification

全部通ってから完了とする。

```bash
pnpm install
pnpm run format:check
pnpm run lint:check
pnpm run typecheck
pnpm run test:cov
pnpm run test:worker
pnpm exec playwright install chromium && pnpm run test:e2e
pnpm run cloudflare:check
KNIP_DISABLE_RAW_TRANSFER=1 pnpm exec knip --include unlisted,unresolved,binaries
pnpm audit --audit-level=high
git diff --check
```

CI の `secret-scan`(gitleaks)は push 後に GitHub 上でしか確認できない。
