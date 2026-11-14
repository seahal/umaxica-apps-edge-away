# Engineering baseline audit (2026-10-07)

Away の開発・CI・Cloudflare Workers 実行基盤を、調査時点の証拠にもとづいて記録する。
この文書は現状の記録であり、変更の決定ではない。
改善候補の backlog は
[plans/2026-10-07-engineering-baseline-hardening.md](../plans/2026-10-07-engineering-baseline-hardening.md)、
検討中の原則は
[ADR 0002](../adr/0002-engineering-baseline-modernization.md) にある。

## 0. 読み方

各項目には次のいずれかの状態を付ける。

| 状態                   | 意味                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| **Confirmed**          | リポジトリの現物、CI 実績、GitHub の読み取り API、公式一次資料で確認した事実 |
| **Candidate**          | 将来採用する価値があり得る改善候補。今回は実装していない                     |
| **Needs verification** | 追加調査なしには採否を判断できない                                           |
| **Deferred**           | Away 本体の実装開始時または運用設計時まで判断を延期する                      |

確認元の表記は次のとおり。

- `repo`: 調査時点の working tree のファイル。
- `gh`: `gh api` による GitHub の読み取り(GET のみ)。
- `web`: 公式文書または npm registry の metadata。確認日はすべて 2026-10-07。
- `jump`: 隣接する Jump リポジトリの読み取り専用参照。由来の確認だけに使う。

`web` の内容は、ページを要約モデル経由で取得した結果である。
原文を逐語で確認したわけではないため、数値や日付を実装判断に使う前に原文を読み直すこと。
要約の信頼度が特に低いと判断した箇所には、その旨を個別に書いた。

## 1. 調査開始時点の状態

| 項目             | 現在値                                                     | 確認元 | 状態      |
| ---------------- | ---------------------------------------------------------- | ------ | --------- |
| 調査日           | 2026-10-07                                                 | —      | Confirmed |
| checkout         | `develop` @ `c0b1cc2`、working tree は clean               | repo   | Confirmed |
| `origin/develop` | `3176e67`。ローカル `develop` が 1 commit 先行(未 push)    | repo   | Confirmed |
| `origin/main`    | `8c061af`(PR #1 の merge commit)                           | repo   | Confirmed |
| ローカル `main`  | `ef4a7d7`。`origin/main` より 2 commit 遅れ                | repo   | Confirmed |
| worktree         | `git worktree list` は主 worktree の 1 件だけ              | repo   | Confirmed |
| remote           | `https://github.com/seahal/umaxica-apps-edge-away`(public) | gh     | Confirmed |
| default branch   | `main`                                                     | gh     | Confirmed |

調査対象は `develop` @ `c0b1cc2` の working tree である。
これは `origin/main` と一致しない。差分は次のとおり。

- `c0b1cc2` と `3176e67` の差は `README.md`、`adr/0001-…`、
  `plans/away-external-navigation.md` の文書 3 件だけで、設定とコードの差はない。
- `origin/main` と `develop` の差には設定変更が含まれる。
  `integration.yaml` の `types:generate` / `types:check` 追加、`package.json`、
  `tsconfig.json`、`scripts/test-worker.mjs`、`pnpm-lock.yaml`、`.oxfmtrc.json`、
  `.gitignore` である。

したがって、この文書の「現在値」は `main` にはまだ入っていないものを含む。
`main` の状態として読み替える場合は `git diff origin/main develop` で確認すること。

### 1.1 この調査で実行できなかったこと

| 内容                                            | 理由                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| ローカルでの `pnpm run …` の実行                | ローカルは Node `v24.21.0`、pnpm `12.4.2`。pin と不一致で `ERR_PNPM_BAD_PM_VERSION` になる |
| 本番 `away.umaxica.net` の response header 取得 | `curl -I` の実行が許可されなかった                                                         |
| Cloudflare アカウント側の設定の確認             | 権限を使っていない。zone 設定、Transform Rules、deploy 済み version は未確認               |
| `npm.flatt.tech` の仕様の一次確認               | ルート URL は空の JSON を返し、公式の仕様文書に到達できなかった                            |
| GitHub の organization / account 単位の設定     | repository 単位の API だけを読んだ                                                         |

品質 gate(format / lint / typecheck / test)の実行結果は、ローカルではなく CI 実績で代替した。
対象 commit は `3176e67` であり、`c0b1cc2` との差は文書だけである。

## 2. リポジトリ構成と scaffold の状態

| 項目           | 現在値                                                                               | 確認元 | 状態      |
| -------------- | ------------------------------------------------------------------------------------ | ------ | --------- |
| アプリ本体     | `src/index.ts` が `GET /health` だけを返す Hono app。他の route はない               | repo   | Confirmed |
| Worker entry   | `src/cloudflare.ts`。`fetch` を app に委譲するだけ。binding は使っていない           | repo   | Confirmed |
| `node:` import | `src/`、`test/`、`e2e/` に `node:` import はない                                     | repo   | Confirmed |
| unit test      | `test/away.test.ts` の 3 件                                                          | repo   | Confirmed |
| e2e            | `e2e/smoke.spec.ts` の 1 件。`e2e/server.ts`(Node + `@hono/node-server`)に対して実行 | repo   | Confirmed |
| runtime check  | `scripts/test-worker.mjs`。esbuild で bundle し、Miniflare 経由で workerd に載せる   | repo   | Confirmed |
| 文書           | `adr/0001-independent-away-responsibility.md`、`plans/` に 3 件が既存                | repo   | Confirmed |

ADR 番号について。
`adr/0001-independent-away-responsibility.md` が既に存在し、`README.md` から「ADR 0001」として参照されている。
番号の衝突を避けるため、今回の ADR は `0002` とした。

## 3. Node / pnpm

### 3.1 現在値

| 項目             | 現在値                                                                  | 確認元 | 状態      |
| ---------------- | ----------------------------------------------------------------------- | ------ | --------- |
| `engines.node`   | `24.20.0`(exact)                                                        | repo   | Confirmed |
| `engines.pnpm`   | `12.0.0`(exact)                                                         | repo   | Confirmed |
| `packageManager` | `pnpm@12.0.0+sha512.…`(hash 付き)                                       | repo   | Confirmed |
| `pmOnFail`       | `error`。不一致の pnpm は切り替えずに失敗する                           | repo   | Confirmed |
| `engineStrict`   | `false`                                                                 | repo   | Confirmed |
| CI の Node       | `actions/setup-node` が `node-version-file: package.json` で解決        | repo   | Confirmed |
| CI の pnpm       | `pnpm/action-setup` が `packageManager` から解決。`version:` 入力はない | repo   | Confirmed |
| version file     | `.node-version`、`.nvmrc`、`.tool-versions`、`mise.toml` はない         | repo   | Confirmed |
| lockfile         | `pnpm-lock.yaml`、`lockfileVersion: '9.0'`、commit 済み                 | repo   | Confirmed |
| CI install       | `pnpm install --frozen-lockfile`                                        | repo   | Confirmed |

`packageManager` と `engines.pnpm` は同じ `12.0.0` を指しており、整合している。
ただし pnpm の版は 2 か所、Node の版は 1 か所に書かれている。
更新時に片方だけ変えると CI が失敗する構造である(Confirmed、意図された fail-closed)。

### 3.2 upstream の現在値(2026-10-07 時点)

| 対象           | pin       | upstream                                 | 確認元                                     | 状態               |
| -------------- | --------- | ---------------------------------------- | ------------------------------------------ | ------------------ |
| Node 24        | `24.20.0` | `v24.21.0`(LTS "Krypton")                | web: nodejs.org/en/about/previous-releases | Confirmed          |
| Node Current   | —         | `v26.10.0`                               | 同上                                       | Confirmed          |
| pnpm           | `12.0.0`  | `12.9.1`(dist-tag `latest`)              | web: registry.npmjs.org/pnpm/latest        | Confirmed          |
| Node の EOL 日 | —         | 取得した要約の日付が不自然で採用できない | 同上                                       | Needs verification |

pin が upstream より古いこと自体は不具合ではない。
exact pin は「意図して上げるまで動かない」ことが目的だからである。
未確認なのは、`24.20.0` → `24.21.0` と `12.0.0` → `12.9.1` の間に security fix が含まれるかどうかである(Needs verification)。

### 3.3 exact pin の性質

利点(Confirmed、仕組みから導ける範囲)。

- ローカル、CI、将来の deploy 環境で同じ toolchain を使える。
- pnpm の更新による lockfile や設定解釈の変化が、意図しない時点で入らない。
- `packageManager` の hash により、取得する pnpm の同一性を検証できる。

コスト(Confirmed)。

- Node と pnpm 本体は、現在の Dependabot 設定(`npm` と `github-actions`)の監視対象ではない。
  `engines` と `packageManager` を Dependabot が更新するかは確認していない(Needs verification)。
- ローカルの版が少しでも違うと `pnpm` が一切動かない。
  今回の調査でも、ローカル pnpm `12.4.2` では script を実行できなかった。
  README は `mise exec node@24.20.0 pnpm@12.0.0 --` を案内している。
- 更新の契機が人間の記憶に依存する。更新周期はどこにも定義されていない。

## 4. pnpm supply-chain policy

### 4.1 現在値

| 設定                       | 現在値                                    | 確認元    | 状態      |
| -------------------------- | ----------------------------------------- | --------- | --------- |
| registry                   | `https://npm.flatt.tech/`(`.npmrc`)       | repo      | Confirmed |
| `ignoreScripts`            | `true`                                    | repo      | Confirmed |
| `allowBuilds`              | `esbuild: false`、`workerd: false`        | repo      | Confirmed |
| `minimumReleaseAge`        | `4320` 分(3 日)                           | repo      | Confirmed |
| `overrides`                | `undici@7.29.0` → `7.29.1`                | repo      | Confirmed |
| `catalog`                  | `@cloudflare/workers-types: 5.20260929.1` | repo      | Confirmed |
| `autoInstallPeers`         | `false`                                   | repo      | Confirmed |
| `enableGlobalVirtualStore` | `false`                                   | repo      | Confirmed |
| `trustPolicy`              | 未設定(pnpm の既定は `off`)               | repo, web | Confirmed |
| `blockExoticSubdeps`       | 未設定(pnpm の既定は `true`)              | repo, web | Confirmed |
| `minimumReleaseAgeStrict`  | 未設定                                    | repo      | Confirmed |

pnpm の既定値は <https://pnpm.io/settings/dependency-resolution> と
<https://pnpm.io/supply-chain-security> の要約による(2026-10-07)。
この文書がどの pnpm 版に対応するかは取得結果からは確認できなかった。
pin している `12.0.0` での既定値と一致するかは Needs verification である。

### 4.2 install script 制御

`ignoreScripts: true` と `allowBuilds: false` の二重指定になっている。
設定ファイルの comment は「script 拒否を維持し、`allowBuilds` は依存ごとの拒否の文書化も兼ねる」と説明している。
esbuild と workerd はどちらも postinstall を持つ package だが、CI の `worker-runtime` と `cloudflare-dry-run` は成功している。
つまり現状は postinstall なしで動作している(Confirmed、CI run `37145939528`)。
この二重指定が冗長か、意図した多重防御かは設計判断であり、ここでは評価しない。

### 4.3 override の負債

`undici@7.29.0` → `7.29.1` の override は、comment によれば Miniflare が pin する脆弱な patch の置換である。

- Away は `miniflare` を `5.20260926.0-alpha` に exact pin している(repo)。
- lockfile には `miniflare@5.20260926.0-alpha` と `miniflare@5.20260930.0-alpha` の 2 版が入っている。
  後者は `wrangler@4.145.0` の依存である(repo)。
  同様に `workerd` も `1.20260926.1` と `1.20260930.2` の 2 版がある。
- npm registry 上の `miniflare@5.20261001.0-alpha` は `undici: 7.29.1` に依存している(web)。
- Jump は `miniflare` を `5.20261001.0-alpha` に上げ、override を既に削除している(jump)。

したがって、この override は Miniflare を更新すれば不要になる可能性が高い(Candidate)。
ただし Away の lockfile で実際に不要になるかは、更新して resolve し直すまで確定しない(Needs verification)。
override は対象版を限定した書き方(`undici@7.29.0`)なので、放置しても別の版を巻き込まない。
負債としての性質は「不要になっても誰も気づかない」ことである。

### 4.4 registry

`.npmrc` は `registry=https://npm.flatt.tech/` を指定している。Jump も同じ値である(jump)。

- 検索結果によれば、これは GMO Flatt Security の Takumi Guard が提供する npm の security proxy で、
  既知の悪性 package を block するものとされる。
  ただしこの情報源は公式一次資料ではない(二次情報、2026-10-07)。
- 次の点は確認できていない(すべて Needs verification)。
  - metadata の `time` field を upstream のまま返すか。`minimumReleaseAge` はこの field に依存する。
  - provenance / trusted publisher の情報を透過するか。`trustPolicy` はこれに依存する。
  - `pnpm audit` が使う audit endpoint をどう扱うか。
  - 可用性と障害時の挙動。CI の全 job がこの registry に依存している。
- pnpm 文書の要約では `minimumReleaseAgeIgnoreMissingTime` の既定が `true` であり、
  `time` field がない registry では release age の検査が黙って skip される。
  Away の `minimumReleaseAge: 4320` が実際に効いているかは、この点が確認できるまで不明である。

これは今回の調査で最も重要な未確認事項の一つである。
設定が存在することと、設定が機能していることは別だからである。

## 5. 依存 package の現在値

| package                     | 指定                        | lockfile     | upstream latest      | 状態                |
| --------------------------- | --------------------------- | ------------ | -------------------- | ------------------- |
| `hono`                      | `^4.13.12`                  | 未確認       | 未確認               | Confirmed(指定のみ) |
| `wrangler`                  | `^4.145.0`                  | `4.145.0`    | `4.147.0`            | Confirmed           |
| `miniflare`                 | `5.20260926.0-alpha`        | 同左(+ 1 版) | `5.20261001.0-alpha` | Confirmed           |
| `vitest`                    | `5.0.2`                     | —            | 未確認               | Confirmed(指定のみ) |
| `typescript`                | `7.0.2`                     | —            | 未確認               | Confirmed(指定のみ) |
| `@cloudflare/workers-types` | `catalog:` → `5.20260929.1` | —            | 未確認               | Confirmed(指定のみ) |

観察(Confirmed)。

- `miniflare` の版は `-alpha` の prerelease であり、registry metadata にも prerelease の印がある。
  `wrangler@4.147.0` 自身が `miniflare@5.…-alpha` に依存しているため、これは Cloudflare 側の現行の配布形態である。
  Away が独自に不安定版を選んだわけではない。
- `miniflare` を直接依存として exact pin しているため、`wrangler` が要求する版とずれると
  workerd が 2 版 install される。現状はその状態である。
- exact pin(`miniflare`、`vitest`、`typescript`、`oxlint` など)と
  caret(`wrangler`、`hono`、`knip` など)が混在している。
  どちらを使うかの基準は文書化されていない。

## 6. GitHub / CI

### 6.1 workflow

`.github/workflows/integration.yaml` の 1 ファイルだけが存在する(repo)。

| 項目          | 現在値                                                          | 状態      |
| ------------- | --------------------------------------------------------------- | --------- |
| trigger       | `push`(`main`、`develop`)と `pull_request`                      | Confirmed |
| permissions   | workflow 全体で `contents: read`                                | Confirmed |
| concurrency   | `workflow`-`ref` 単位、`cancel-in-progress: true`               | Confirmed |
| checkout      | 全 job で `persist-credentials: false`                          | Confirmed |
| Action の pin | 外部 Action 4 種すべて full-length commit SHA + version comment | Confirmed |
| runner        | `worker-runtime` だけ `ubuntu-latest`、他は `ubuntu-slim`       | Confirmed |

job と実行内容。

| job                  | 実行内容                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `quality`            | `format:check`、`lint:check`、`types:generate`、`types:check`、`typecheck`、`knip`(一部 issue type のみ) |
| `unit`               | `test:cov`                                                                                               |
| `worker-runtime`     | `test:worker`                                                                                            |
| `e2e`                | Playwright chromium の install と `test:e2e`                                                             |
| `dependencies`       | `pnpm audit --audit-level=high`、`pnpm outdated`(`continue-on-error`)                                    |
| `secret-scan`        | `gitleaks/gitleaks-action`(`fetch-depth: 0`、`GITHUB_TOKEN` を渡す)                                      |
| `cloudflare-dry-run` | `cloudflare:check`(`wrangler deploy --dry-run`)と bundle size の表示                                     |

外部 Action の pin(repo)。

| Action                     | pin                                                |
| -------------------------- | -------------------------------------------------- |
| `actions/checkout`         | `3d3c42e5aac5ba805825da76410c181273ba90b1`(v7.0.1) |
| `actions/setup-node`       | `820762786026740c76f36085b0efc47a31fe5020`(v7.0.0) |
| `pnpm/action-setup`        | `ea17c68df8912ef543352723c149a84f56e3d413`(v6.1.0) |
| `gitleaks/gitleaks-action` | `e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e`(v3.0.0) |

comment の version と SHA が実際に対応しているかは照合していない(Needs verification)。

CI 実績(gh)。
直近の `CI` run はすべて success である。
`develop` @ `3176e67` の run `37145939528`(2026-10-03T18:54Z)では 7 job すべてが success で、所要は 1 分 33 秒だった。

### 6.2 ruleset と branch protection

| 項目                      | 現在値                                                                                          | 確認元 | 状態      |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ------ | --------- |
| ruleset                   | `harden main`(id `24423262`)、enforcement `active`                                              | gh     | Confirmed |
| 対象                      | `refs/heads/main` のみ                                                                          | gh     | Confirmed |
| bypass actor              | なし。`current_user_can_bypass: never`                                                          | gh     | Confirmed |
| rule                      | `deletion`、`non_fast_forward`、`pull_request`、`required_status_checks`                        | gh     | Confirmed |
| required checks           | `quality`、`unit`、`worker-runtime`、`e2e`、`secret-scan`、`cloudflare-dry-run`、`dependencies` | gh     | Confirmed |
| strict                    | `strict_required_status_checks_policy: true`                                                    | gh     | Confirmed |
| approval count            | `required_approving_review_count: 0`                                                            | gh     | Confirmed |
| merge method              | `merge`、`squash`、`rebase` すべて許可                                                          | gh     | Confirmed |
| classic branch protection | `main` には未設定(404 "Branch not protected")                                                   | gh     | Confirmed |
| `develop` の保護          | ruleset の対象外                                                                                | gh     | Confirmed |

approval count が 0 であることについて。
これは「PR は必須だが、他者の承認は不要」という設定である。
単独開発では承認者がいないため、0 以外にすると merge できなくなる。
したがって欠陥とは扱わない。
開発者が複数になったとき、または AI agent が PR を出す運用を始めるときに方針として再判断する事項である(Deferred)。

`dependencies` job が required check に含まれている点は記録しておく。
`pnpm audit` は新しい advisory の公開によって、コード変更と無関係に失敗し得る。
その場合、bypass actor がいないため `main` への merge が全面的に止まる。
これは意図した fail-closed かもしれないし、運用上の事故要因かもしれない(Deferred、運用方針の判断)。

### 6.3 Actions の設定

| 項目                               | 現在値  | 確認元 | 状態      |
| ---------------------------------- | ------- | ------ | --------- |
| `allowed_actions`                  | `all`   | gh     | Confirmed |
| `sha_pinning_required`             | `false` | gh     | Confirmed |
| `default_workflow_permissions`     | `read`  | gh     | Confirmed |
| `can_approve_pull_request_reviews` | `false` | gh     | Confirmed |
| environments                       | 0 件    | gh     | Confirmed |

SHA pin は workflow の書き方として守られているが、repository 設定としては強制されていない。
GitHub 文書の要約によれば、"Require actions to be pinned to a full-length commit SHA" を有効にすると
すべての Action に full-length SHA が要求され、local action(`./`)は対象外、reusable workflow は tag 参照のままでよい
(web: docs.github.com の "Managing GitHub Actions settings for a repository"、2026-10-07)。
Away の現在の workflow はこの条件を既に満たしている(Candidate、P1-6)。

### 6.4 security 機能

| 機能                            | 現在値                                           | 確認元 | 状態      |
| ------------------------------- | ------------------------------------------------ | ------ | --------- |
| secret scanning                 | `enabled`                                        | gh     | Confirmed |
| secret scanning push protection | `enabled`                                        | gh     | Confirmed |
| non-provider patterns           | `disabled`                                       | gh     | Confirmed |
| validity checks                 | `disabled`                                       | gh     | Confirmed |
| Dependabot alerts               | 有効(204)。open alert は 0 件                    | gh     | Confirmed |
| Dependabot security updates     | `enabled`                                        | gh     | Confirmed |
| Dependabot version updates      | `npm` と `github-actions`、weekly、cooldown 7 日 | repo   | Confirmed |
| code scanning default setup     | `not-configured`                                 | gh     | Confirmed |
| Dependency Review action        | 未導入                                           | repo   | Confirmed |
| CodeQL workflow                 | 未導入                                           | repo   | Confirmed |

Dependabot について。
`Dependabot Updates` の run が 2026-10-03 に `npm_and_yarn` と `github_actions` の両方で success している(gh)。
PR の一覧には PR #1 しかなく、Dependabot が作成した PR はまだない。

- Dependabot が `npm.flatt.tech` と `catalog:` 指定、pnpm 12 の lockfile を正しく扱えるかは、
  PR が実際に作られるまで確認できない(Needs verification)。
- Dependabot の cooldown(7 日)と pnpm の `minimumReleaseAge`(3 日)は別の仕組みである。
  前者は PR を作る時期、後者は install 時の resolve を制御する。重複ではなく層が違う。

## 7. Cloudflare Workers

### 7.1 `wrangler.jsonc` の現在値

| 項目                  | 現在値                                                              | 状態      |
| --------------------- | ------------------------------------------------------------------- | --------- |
| `$schema`             | `node_modules/wrangler/config-schema.json`                          | Confirmed |
| `name`                | `umaxica-apps-edge-away`                                            | Confirmed |
| `main`                | `src/cloudflare.ts`                                                 | Confirmed |
| `compatibility_date`  | `2026-05-26`                                                        | Confirmed |
| `compatibility_flags` | `["nodejs_compat"]`                                                 | Confirmed |
| `version_metadata`    | binding `UMAXICA-APPS-EDGE-AWAY-VERSION`                            | Confirmed |
| `workers_dev`         | `false`                                                             | Confirmed |
| `routes`              | `away.umaxica.net`、zone `umaxica.net`、`custom_domain: true`       | Confirmed |
| observability         | logs / traces / issues すべて有効、sampling rate 1、`persist: true` | Confirmed |
| `redact_query_string` | `true`                                                              | Confirmed |
| binding               | KV、D1、R2、rate limit、secret などはない                           | Confirmed |
| environment           | `env` の定義はない(production 単一)                                 | Confirmed |

観察(Confirmed)。

- `$schema` は install 済みの wrangler を指すため、schema は wrangler の版に追従する。
- `version_metadata` の binding は定義されているが、`src/` からは参照されていない。
  `/health` の `version` は source 内の定数 `0.1.0` である。
  また binding 名にハイフンが含まれるため、参照するときは `env['…']` の形になる。
- `redact_query_string` は `scripts/test-worker.mjs` が assert しており、
  誤って `false` にすると `worker-runtime` job が失敗する。

### 7.2 `compatibility_date`

| 事実                                                                                    | 確認元 |
| --------------------------------------------------------------------------------------- | ------ |
| Away の値は `2026-05-26`                                                                | repo   |
| Jump の値も `2026-05-26` で同一                                                         | jump   |
| Away の scaffold commit は 2026-10-03。date はそれより約 4 か月前                       | repo   |
| Cloudflare は「更新したくなければ更新する必要はない」と述べ、古い date を無期限に支える | web    |
| Cloudflare は新規 project では date を現在日にすることを勧めている                      | web    |
| 更新時は compatibility flags の一覧で変更点を確認し、Worker を test するよう求めている  | web    |

出典は <https://developers.cloudflare.com/workers/configuration/compatibility-dates/>(2026-10-07)。

解釈。
この date は Away が選んだものではなく、Jump から継承された値である。
Jump にとっては、既存の挙動を固定する意味がある。
Away は新規で、固定すべき既存の挙動がまだ `/health` しかない。
したがって「古いから直す」ではなく、「Away 自身の起点をいつにするかを一度も決めていない」ことが論点である(Candidate、P0-1)。

`2026-05-26` 以降に既定になった flag の一覧は取得を試みたが、
返ってきた要約は 4 件だけで、網羅性に疑いがある。
これを根拠に「更新しても影響がない」とは言えない(Needs verification)。

### 7.3 `nodejs_compat`

| 事実                                                                  | 確認元 |
| --------------------------------------------------------------------- | ------ |
| `compatibility_flags` に `nodejs_compat` がある                       | repo   |
| `src/` は `hono` だけを import し、`node:` module を使っていない      | repo   |
| `scripts/test-worker.mjs` は `platform: 'browser'` で bundle している | repo   |
| Jump も同じ flag を持つ                                               | jump   |

Cloudflare 文書の要約は、「`2026-08-04` 以降の compatibility date では `nodejs_compat` が自動で有効になる」と述べていた
(web: <https://developers.cloudflare.com/workers/runtime-apis/nodejs/>、2026-10-07)。
この日付は要約モデルの出力であり、原文で確認していない。
事実であれば、date を更新すると flag の明示が不要になる一方、flag を外しても Node.js 互換は無効にならないことになる。
実装判断に使う前に必ず原文を確認すること(Needs verification)。

現時点で確認できるのは、「現在の source は Node.js 互換を必要としていないように見えるが、flag が有効である」という点までである。
Hono や将来の依存が内部で必要とするかは確認していない。
Away 本体(URL 検証、cushion page)の実装が何を使うか決まるまで、要否は判断できない(Deferred)。

### 7.4 型生成

| 事実                                                                                      | 確認元 |
| ----------------------------------------------------------------------------------------- | ------ |
| `types:generate` は `wrangler types`、`types:check` は `wrangler types --check`           | repo   |
| `worker-configuration.d.ts` は commit されておらず、working tree にも存在しない           | repo   |
| `tsconfig.json` の `include` は `worker-configuration.d.ts` を含む。`types` は `["node"]` | repo   |
| CI は `types:generate` → `types:check` → `typecheck` の順に実行する                       | repo   |
| `@cloudflare/workers-types` が catalog 経由で devDependency にある                        | repo   |
| この 2 step は `develop` にだけあり、`origin/main` にはない                               | repo   |

Cloudflare は `@cloudflare/workers-types` よりも `wrangler types` による生成を勧めている。
生成物は compatibility date と flags に基づく runtime 型と `Env` を含む。
生成物の commit は任意で、`--check` は commit 済みの型が古い場合に CI を失敗させる用途とされる
(web: <https://developers.cloudflare.com/workers/languages/typescript/>、2026-10-07)。

現状の評価(Confirmed)。

- CI では生成した直後に check しているため、`types:check` は drift を検出しない。
  README もこの点を明記している。現状の check が保証するのは「生成が成功すること」だけである。
- 生成物がないと `ExecutionContext` などの型が解決できず、ローカルの `typecheck` は
  `types:generate` を先に実行しないと通らない。
- `@cloudflare/workers-types` が現在も必要かは確認していない。
  `wrangler` の optional peer dependency ではある(web)。
  CI の knip は `--include unlisted,unresolved,binaries` に限定されており、未使用依存を検出しない(Needs verification)。

### 7.5 observability と query-string redaction

`wrangler.jsonc` の comment は、次の設計意図を記録している(Confirmed、repo)。

- invocation log は request URL を記録するため、`redact_query_string: true` に依存する。
- sampling は privacy の制御ではない。
- query の値を pathname に入れてはならない。platform が path と metadata を保存することは受容済みの risk である。

未確認事項(すべて Needs verification)。

- `redact_query_string` が logs、traces、issues のどの範囲に適用されるか。
- `Referer` header など、URL 以外の経路で query が記録されないか。
- `head_sampling_rate: 1` と `persist: true` の費用と保持期間。
- これらの設定が本番に deploy 済みの version に実際に反映されているか。

Away は外部 URL を query で受け取る設計になる可能性が高く、
redaction は Away 本体の privacy 要件と直結する。
本体の入力形式が決まった時点で再確認が必要である(Deferred)。

### 7.6 Custom Domain

`routes` は `away.umaxica.net` を Custom Domain として宣言している(Confirmed、repo)。
次の点は確認していない(Needs verification)。

- Custom Domain が Cloudflare 上で実際に作成済みか。
- 現在 deploy されている Worker の version と、それがどの commit に対応するか。
- zone `umaxica.net` に適用されている WAF、Transform Rules、Managed Transforms、cache 設定。

### 7.7 response header の最終決定権

背景情報(今回は未確認)。
過去の観測として、Worker が明示していない次の header が本番 response に付いていたという報告がある。

- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: same-origin`
- `X-XSS-Protection: 1; mode=block`

今回確認できたこと(Confirmed)。

- `src/` はこれらの header を設定していない。security header の middleware もない。
- `wrangler.jsonc` に header を付ける設定はない。

今回確認できなかったこと。

- 本番 response の header。`curl -I` が許可されず、再現を取れていない。
- 付与元。zone の Managed Transforms、Transform Rules、その他の可能性があるが、どれも確定していない。

論点は「どの header を付けるか」ではなく、
「最終 response header を決める層がどこか」が決まっていないことである。
Worker が header を設定しても、zone 側の rule が上書きまたは追加するなら、
Worker の test は本番の response を保証しない。
cushion page は framing と referrer の扱いが機能要件に直結するため、
本体実装の前に確認する価値が高い(Needs verification、P0-3)。

### 7.8 deploy

| 事実                                                                 | 確認元 |
| -------------------------------------------------------------------- | ------ |
| deploy 用の workflow はない                                          | repo   |
| `package.json` に deploy script はない。あるのは dry-run と dev だけ | repo   |
| GitHub の environment は 0 件                                        | gh     |
| Cloudflare の API token を参照する workflow はない                   | repo   |

deploy は手動であり、CI は dry-run までである(Confirmed)。
誰が、どの端末から、どの認証で deploy するかは repository 内に記録がない(Needs verification)。

## 8. test 層が保証するもの

| 層                     | 実行環境                              | 保証すること                                                                                       | 保証しないこと                                                        |
| ---------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Vitest(`test:cov`)     | Node                                  | app の logic、coverage 99%、adapter が app に委譲すること                                          | workerd での動作、bundle 後の動作、binding、compatibility date の影響 |
| Playwright(`test:e2e`) | Node + `@hono/node-server` + chromium | 実 HTTP 越しの挙動、将来は browser 上の表示と操作                                                  | workerd での動作、Cloudflare の edge が加える header、本番の route    |
| `test:worker`          | workerd(Miniflare 経由)               | bundle が workerd で起動すること、`wrangler.jsonc` の date と flags での挙動、redaction 設定の存在 | wrangler 自身の bundle との一致、本番 runtime との一致、zone 側の挙動 |
| `cloudflare:check`     | wrangler(upload なし)                 | config が妥当であること、wrangler の bundler で build できること、bundle size                      | 実行時の挙動、deploy の成否、認証、route の衝突                       |

重複に見える点と、役割の違い(Confirmed)。

- `/health` が 200 を返すことは、Vitest、Playwright、`test:worker` の 3 層で確認されている。
  scaffold 段階では検証内容がほぼ同じに見えるが、実行環境が Node、Node + HTTP、workerd と異なる。
  本体が実装されると、各層が検出できる障害は分かれる。
- `test:worker` は esbuild で独自に bundle し、`cloudflare:check` は wrangler で bundle する。
  つまり「workerd で実行される bundle」と「deploy される bundle」は別物である。
  これは現状の構成上の隙間であり、どちらかを削れば埋まるものではない。
- Playwright の対象は Node server であり、Worker ではない。
  現状の e2e は「Hono app が HTTP で応答する」ことの確認である。

local workerd と production runtime の差異(Needs verification)。
local の workerd は npm で配布された版であり、本番 runtime の版とは一致しない可能性がある。
また local には Cloudflare の edge(TLS、WAF、zone rule、cache、`request.cf`)が存在しない。
`scripts/test-worker.mjs` は `cf: false` を指定しており、`request.cf` を再現しない。
差異の具体的な範囲は Cloudflare 文書で確認していない。

### 8.1 `test:worker` の実装上の依存

`scripts/test-worker.mjs` は次の API に依存している(Confirmed、repo)。

- `wrangler` の `unstable_readConfig`。名前のとおり安定 API ではない。
- `miniflare` の `convertV4MiniflareOptions`。Miniflare 5 が旧形式の option を変換するための関数と読める。
- `miniflare` の `-alpha` 版への exact pin。

script 冒頭の comment は「workerd を Node だけの fake に置き換えてはならない」と明記している。
この方式は現在動作しており、CI で success している。
依存している API が安定版でないことは、誤りではなく保守コストの性質として記録する。

### 8.2 Cloudflare が現在案内している test tooling

出典は <https://developers.cloudflare.com/workers/testing/> とその下位ページ(2026-10-07)。

| tooling                    | 位置づけ                                              | package / import                                |
| -------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| Workers Vitest integration | 関数や module 単位の test を Workers runtime 内で実行 | `@cloudflare/vitest-plugin`、`cloudflareTest()` |
| `createTestHarness()`      | 1 つ以上の Worker を全体として試す integration test   | `import { createTestHarness } from "wrangler"`  |

確認できた事実(web)。

- `@cloudflare/vitest-plugin` の latest は `1.3.6`。peer dependency は `vitest: ^4.1.0`。
  metadata に prerelease の印がある。
- `createTestHarness()` は Wrangler または Cloudflare Vite plugin の production build 出力を実行し、
  任意の Node.js test runner、Playwright、MSW と組み合わせられるとされる。

Away との関係。

- Away は `vitest@5.0.2` を使っている。`^4.1.0` は 5.x を満たさない。
  plugin が Vitest 5 に対応しているかは確認していない。
  対応していなければ、採用には Vitest の downgrade が必要になる(Needs verification)。
- `createTestHarness()` は wrangler の build 出力を実行するとされる。
  事実であれば、8 節で述べた「実行される bundle と deploy される bundle が別物」という隙間を埋める可能性がある。
  安定度、必要な wrangler の版、workerd 上で動くかどうかは取得結果からは確認できなかった(Needs verification)。
- 以前の公式 package 名は `@cloudflare/vitest-pool-workers` だったと記憶しているが、
  今回の公式文書では `@cloudflare/vitest-plugin` が案内されている。
  名称は変わり得るので、採用時点で再確認すること。

現在の方式と公式方式の比較は backlog の P1-2 にある。
ここでの結論は、「置換すべき」ではなく「比較に必要な事実がまだ揃っていない」である。

## 9. supply-chain 防御の層

| 層           | 手段                                           | 状態                     | 防ぐもの                             | 防がないもの                                  |
| ------------ | ---------------------------------------------- | ------------------------ | ------------------------------------ | --------------------------------------------- |
| registry     | `npm.flatt.tech`                               | 導入済み                 | 既知の悪性 package(とされる)         | 未知の悪性 package。仕様は未確認              |
| resolve      | `minimumReleaseAge: 4320`                      | 導入済み(実効性は未確認) | 公開直後の悪性版                     | 3 日以上気づかれない侵害                      |
| resolve      | `blockExoticSubdeps`                           | 既定値に依存             | git / tarball URL の間接依存         | registry 上の侵害                             |
| resolve      | `trustPolicy`                                  | 未導入                   | 信頼水準が下がった版                 | registry が metadata を返さない場合は機能不明 |
| install      | `--frozen-lockfile`                            | 導入済み                 | lockfile と異なる版の混入            | lockfile 自体に入った悪性版                   |
| install      | `ignoreScripts`、`allowBuilds`                 | 導入済み                 | install script の実行                | import 時に実行される悪性コード               |
| toolchain    | Node / pnpm の exact pin と hash               | 導入済み                 | toolchain のすり替えと意図しない更新 | pin した版自体の脆弱性                        |
| 既知の脆弱性 | `pnpm audit --audit-level=high`                | 導入済み                 | advisory が出ている high 以上の依存  | moderate 以下、advisory のない問題            |
| 既知の脆弱性 | Dependabot alerts / security updates           | 導入済み                 | 同上(通知と修正 PR)                  | 同上                                          |
| 更新         | Dependabot version updates                     | 導入済み                 | 依存と Action の陳腐化               | Node / pnpm 本体の陳腐化(未確認)              |
| PR 時点      | Dependency Review                              | 未導入                   | PR が持ち込む脆弱な依存と license    | —                                             |
| CI の Action | commit SHA pin                                 | 導入済み(規約)           | tag の付け替え                       | pin した commit 自体の悪性                    |
| CI の Action | SHA pin の強制、allow-list                     | 未導入                   | 規約からの逸脱                       | —                                             |
| CI の権限    | `contents: read`、`persist-credentials: false` | 導入済み                 | token の悪用範囲                     | —                                             |
| secret       | gitleaks(CI)                                   | 導入済み                 | commit 済みの secret(全履歴)         | push 済みの secret の無効化                   |
| secret       | GitHub secret scanning + push protection       | 導入済み                 | provider pattern の secret の push   | non-provider pattern(無効)                    |
| 自作コード   | oxlint(type-aware)、TypeScript strict          | 導入済み                 | 一部の誤り                           | data flow に基づく脆弱性                      |
| 自作コード   | CodeQL / code scanning                         | 未導入                   | —                                    | —                                             |

重複する可能性のある組(評価は backlog に回す)。

- `pnpm audit`、Dependabot alerts、Dependency Review は、いずれも既知の advisory を情報源とする。
  違いは検出の時点(CI の全 run、常時、PR の差分)と、失敗のさせ方である。
- gitleaks と GitHub secret scanning はどちらも secret を検出する。
  違いは検出規則と時点(CI での履歴走査、push 時の block)である。

## 10. Jump からの継承の確認

Jump との比較で確認できたこと(jump、読み取りのみ)。

| 項目                         | Away                      | Jump                 |
| ---------------------------- | ------------------------- | -------------------- |
| `engines` / `packageManager` | Node 24.20.0、pnpm 12.0.0 | 同一                 |
| `compatibility_date`         | `2026-05-26`              | 同一                 |
| `compatibility_flags`        | `nodejs_compat`           | 同一                 |
| `.npmrc` registry            | `npm.flatt.tech`          | 同一                 |
| `.github/dependabot.yml`     | —                         | 同一内容             |
| `.worktreeinclude`           | —                         | 同一内容             |
| `pnpm-workspace.yaml`        | undici override あり      | override なし        |
| `miniflare`                  | `5.20260926.0-alpha`      | `5.20261001.0-alpha` |
| `wrangler`                   | `^4.145.0`                | `^4.147.0`           |
| `vitest`                     | `5.0.2`                   | `5.0.3`              |
| CI の `types:*` step         | あり                      | なし                 |

Jump は port 以降も更新が進んでおり、Away は port 時点の版に留まっている。
Away には Jump の更新が自動では伝わらない。
両者を同期させるか、独立に管理するかは決まっていない(Deferred)。

継承されたまま Away の文脈に合わなくなっている記述(Confirmed)。

- `.github/dependabot.yml` の comment は「`integration.yaml` の全 Action が deprecated な Node 20 runtime に
  なった経緯」に触れている。これは Jump の歴史であり、Away では起きていない。
- `.worktreeinclude`(次節)。

AGENTS.md は、Jump のアプリケーションコード、鍵、JWKS、registry を port していないと述べている。
`src/` が `/health` だけであること、`wrangler.jsonc` に binding がないことは、この記述と矛盾しない(Confirmed)。

## 11. `.worktreeinclude`

| 事実                                                                                                            | 確認元                                  |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `.worktreeinclude` が commit されている                                                                         | repo                                    |
| 内容は、新しい git worktree に `.env`、`.dev.vars`、`.secrets/`、`.claude/settings.local.json` を copy する指定 | repo                                    |
| Jump の同名 file と内容が同一                                                                                   | jump                                    |
| `git worktree list` は主 worktree だけを返す                                                                    | repo                                    |
| この project は Git Worktree を使わない方針である                                                               | 依頼時の指示(repository 内に記録はない) |

Git Worktree を使わない方針と、worktree 用の設定 file が存在することは整合しない(Confirmed、不整合候補)。
加えて、この file は secret を含み得る file を別の directory に複製する指定である。
worktree を使わない限り実害はないが、誤って使われた場合に secret の複製先が増える。
また「worktree を使わない」という方針自体が AGENTS.md にも README にも書かれていない。
今回は削除していない(Candidate、P2-3)。

## 12. その他の観察

いずれも Confirmed(repo)で、優先度は低い。

- `vitest.config.ts` は `globals: true` だが、AGENTS.md は `describe` などを明示的に import するよう求めている。
  test は明示 import しているので動作上の問題はない。設定と規約が食い違っている。
- `.oxlintrc.json` の `env` は `browser: true` である。Worker の実行環境は browser ではない。
- `.oxfmtrc.json` は `plans/` を format 対象から除外している。`adr/` と `memos/` は対象である。
- `plans/` に `pasted-content-id-…` という名前の file が 2 件ある。AGENTS.md は説明的な file 名を求めている。
- `README.md` の Layout には `memos/` の記載がなかったため、今回 1 行だけ追加した。
- 作業 directory に `coverage/`、`dist/`、`test-results/`、`.wrangler/` があるが、すべて `.gitignore` の対象である。

## 13. 批判的レビューの結果

依頼内容を敵対的に読み直し、次の点を文書に反映した。

| 懸念                                             | 判定と反映                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 更新のための更新になっていないか                 | なり得る。Node、pnpm、wrangler の「upstream より古い」は事実として記録したが、それだけでは backlog の理由にしていない  |
| 動いている Miniflare 方式を理由なく置換しないか  | 置換は提案していない。公式 plugin は Vitest 5 と peer が合わない可能性があり、移行はむしろ後退になり得ることを記録した |
| Cloudflare の推奨と Away の要件の混同            | 「新規 project は現在日」は推奨であり、Away の要件ではない。論点を「Away が起点を決めていない」に置き直した            |
| latest と appropriate の混同                     | `miniflare` は latest でも `-alpha` である。版の新しさではなく、wrangler との整合と重複 install を論点にした           |
| hardening の名目での保守コスト増                 | CodeQL と Dependency Review は、現在の source 量(2 file)に対して効果が小さい。本体実装後まで延期する候補とした         |
| CI check の増加の目的化                          | required check は既に 7 件ある。追加候補ごとに「既存のどの検出と重なるか」を backlog に書いた                          |
| 同じ障害を複数 tool で検出するだけの gate        | `pnpm audit` / Dependabot / Dependency Review、gitleaks / secret scanning が該当し得る。9 節に層として整理した         |
| registry と provenance policy の相互作用         | `trustPolicy` は即採用にしていない。さらに、既存の `minimumReleaseAge` も同じ理由で実効性が未確認であることを発見した  |
| zone policy を確認せず Worker の責任範囲を決める | header の付与元は未確定のままとし、Worker 側の security header 実装を backlog に入れていない                           |

レビューで新たに見つかった、依頼文にない論点。

1. `minimumReleaseAge` は registry の `time` field に依存し、欠けていると既定で黙って skip される。
   既に導入済みの防御が機能していない可能性がある(4.4 節)。
2. `dependencies` job が required check であり、bypass actor がいないため、
   新しい advisory の公開だけで `main` への merge が止まる(6.2 節)。
3. `test:worker` が実行する bundle と、deploy される bundle は別物である(8 節)。
4. 公式 Vitest plugin の peer dependency は `vitest ^4.1.0` で、Away の `5.0.2` と合わない(8.2 節)。
5. `types:check` は現状 drift を検出していない(7.4 節)。README は既にこれを認めている。
6. 調査対象の `develop` は `origin/main` と設定が異なる(1 節)。

## 14. 追加調査(2026-10-07、同日)

初回の調査で Needs verification とした項目のうち、読み取りだけで確認できるものを追加で調べた。
この節の内容は、前の節の該当箇所より新しい。食い違う場合はこの節を優先する。
確認元の `cache` は、ローカルの pnpm metadata cache(`~/.cache/pnpm/v11/`)の読み取りである。

### 14.1 registry は `time` と provenance を返す

| 事実                                                                                                          | 確認元 | 状態      |
| ------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| `npm.flatt.tech/is-number` の metadata に `time` object があり、npmjs.org と同じ値である                      | web    | Confirmed |
| pnpm が `npm.flatt.tech` から取得して cache した metadata(`wrangler`、`file-type` など)に `time` が入っている | cache  | Confirmed |
| `npm.flatt.tech/hono/latest` の `dist.attestations`(SLSA provenance v1)が npmjs.org と同じ内容で返る          | web    | Confirmed |
| 同じ response の `_npmUser` に `trustedPublisher` がある                                                      | web    | Confirmed |
| `dist.tarball` は `https://registry.npmjs.org/…` を指している                                                 | web    | Confirmed |

結論。
4.4 節で挙げた「`time` field が欠けていて `minimumReleaseAge` が黙って skip されている」という懸念は、
観察した範囲では当たらない。registry は `time` を返しており、pnpm はそれを受け取っている。
`trustPolicy` が必要とする trust evidence も、少なくとも `hono` では透過している。

残る未確認事項(Needs verification)。

- 拒否の動作そのものは観察していない。確認したのは「検査に必要な data が届いている」ことまでである。
- 確認した package は数件である。全 package で同じとは限らない。
- `dist.tarball` が npmjs.org を指すことの意味。
  tarball の取得が proxy を経由するのか、npmjs.org に直接向かうのかは確認していない。
  後者であれば、proxy が block できるのは metadata の段階だけになる。
- `pnpm audit` の endpoint の扱いと、registry 停止時の挙動は未確認のままである。

### 14.2 undici override は `miniflare` の直接 pin が原因である

| 事実                                                                     | 確認元               | 状態      |
| ------------------------------------------------------------------------ | -------------------- | --------- |
| install 済みの `miniflare@5.20260926.0-alpha` は `undici: 7.29.0` に依存 | repo(`node_modules`) | Confirmed |
| install 済みの `miniflare@5.20260930.0-alpha` は `undici: 7.29.1` に依存 | repo(`node_modules`) | Confirmed |
| 前者は Away の直接依存、後者は `wrangler@4.145.0` の依存                 | repo                 | Confirmed |

結論。
override が必要なのは、Away が直接 pin している古い方の `miniflare` だけである。
直接依存の `miniflare` を `wrangler` が要求する版に揃えれば、
override の削除と、`miniflare` / `workerd` の 2 版 install の解消が同時に済む(Candidate、P2-4)。
4.3 節の「更新すれば不要になる可能性が高い」は、「不要になる」に更新する。

### 14.3 `createTestHarness()` は install 済みの wrangler に既にある

| 事実                                                                                                     | 確認元                                               | 状態      |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------- |
| `wrangler@4.145.0` の型定義が `createTestHarness` を export している                                     | repo(`node_modules/wrangler/wrangler-dist/cli.d.ts`) | Confirmed |
| 名前に `unstable_` / `experimental_` の接頭辞がない                                                      | repo                                                 | Confirmed |
| JSDoc は「Workers を実行する local test server を作る」と説明し、`listen()`、`fetch()`、`close()` を示す | repo                                                 | Confirmed |
| 公式文書は「Wrangler または Cloudflare Vite plugin の production build 出力を実行する」と述べる          | web                                                  | Confirmed |
| 公式文書に、安定度の表示、必要な最低版、Miniflare 直接利用との比較はない                                 | web                                                  | Confirmed |

結論。
`createTestHarness()` は、依存を追加せずに試せる。
現在の `scripts/test-worker.mjs` が依存する `unstable_readConfig`、`convertV4MiniflareOptions`、
`miniflare` と `esbuild` の直接依存を、接頭辞のない API 1 つに置き換えられる可能性がある。
実行する bundle が wrangler の build 出力になるなら、8 節の「実行する bundle と deploy する bundle が別物」も解消する。

残る未確認事項(Needs verification)。

- 実際に `wrangler.jsonc` を渡して `/health` と 404 を検査できるか。試作していない。
- `redact_query_string` の assert をどう残すか。現在は `unstable_readConfig` で読んでいる。
- 接頭辞がないことは、安定性の保証ではない。変更履歴は確認していない。

### 14.4 公式 Vitest plugin は Vitest 5 を peer に含まない

`cloudflare/workers-sdk` の `main` にある `packages/vitest-plugin/package.json` は、
`version: 1.3.6`、`peerDependencies.vitest: ^4.1.0` である(web、2026-10-07)。
npm registry の metadata と一致する。
Away の `vitest@5.0.2` はこの範囲に入らない(Confirmed)。

結論。
現時点で Vitest plugin を採用するには、Vitest を 4 系に下げるか、peer の不一致を受け入れる必要がある。
Away の unit test は binding を使わないため、Workers runtime 内で unit test を実行する利点は現在は小さい。
8.2 節の評価は、「plugin は見送り、`createTestHarness()` を先に評価する」方向に寄る。

### 14.5 `nodejs_compat` は `2026-08-04` 以降の date で既定になる

Cloudflare 文書の source(`cloudflare-docs` の `workers/runtime-apis/nodejs/index.mdx`)に、
次の記述があることを確認した(web、2026-10-07)。

- `2026-08-04` 以降の compatibility date では、`nodejs_compat` と `nodejs_compat_v2` が既定で有効になる。
- `2024-09-23` から `2026-08-03` までの date では、`nodejs_compat` flag を追加して opt in する。
- 既存の project は date の更新時に flag を削除する必要はない。新しい設定では省略する。
- `2026-08-04` 以降の date で Node.js 互換を完全に無効にする方法についての記述がある。
  具体的な flag 名は取得した範囲では確認できなかった。

7.3 節でこの日付を「要約モデルの出力で原文未確認」としたが、source でも同じ記述を確認した。
状態を Confirmed に更新する。

Away への意味。
Away の date は `2026-05-26` で、flag を明示する必要がある期間に入っている。現在の設定は文書と整合する。
date を `2026-08-04` 以降に上げると、flag の有無にかかわらず Node.js 互換が有効になる。
つまり P0-1 で date を上げる場合、「`nodejs_compat` を外す」という選択肢は、flag を消すだけでは実現しない。

### 14.6 Away はまだ deploy されていない

リポジトリ所有者によれば、2026-10-07 時点で Away は Cloudflare に deploy されていない
(口頭での確認。Cloudflare 側の状態は読み取っていない)。

これにより、次の点が変わる。

- 7.7 節の header の報告は、Away の本番 response の観測ではあり得ない。
  同じ zone の別の hostname での観測か、別の service での観測である可能性がある。出所は未確認である。
- P0-3(response-header ownership)は、Away を初めて deploy するまで Away 自身では確認できない。
  zone の設定を読み取る調査は、deploy を待たずに行える。
- 7.5 節と 7.6 節の「本番に反映されているか」は、現時点では問い自体が成立しない。
- 初回 deploy の直後が、local と本番の response header を並べて差分を取る最初の機会になる。

### 14.7 追加調査でも確認できなかったこと

| 項目                                          | 理由                                                       |
| --------------------------------------------- | ---------------------------------------------------------- |
| 本番 response header                          | `curl` の実行が許可されなかった。P0-3 は未着手のままである |
| `2026-05-26` 以降の compatibility flag の全件 | 一覧の原文を取得していない                                 |
| `minimumReleaseAge` による拒否の観察          | 実 install を伴うため実施していない                        |
| Dependabot が Node / pnpm 本体を更新するか    | 未調査                                                     |

## 15. 参照した一次資料

確認日はすべて 2026-10-07。

- Cloudflare: <https://developers.cloudflare.com/workers/testing/>
- Cloudflare: <https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/>
- Cloudflare: <https://developers.cloudflare.com/workers/testing/test-harness/>
- Cloudflare: <https://developers.cloudflare.com/workers/testing/test-harness/get-started/>
- Cloudflare: <https://developers.cloudflare.com/workers/configuration/compatibility-dates/>
- Cloudflare: <https://developers.cloudflare.com/workers/configuration/compatibility-flags/>
- Cloudflare: <https://developers.cloudflare.com/workers/runtime-apis/nodejs/>
- Cloudflare: <https://developers.cloudflare.com/workers/languages/typescript/>
- pnpm: <https://pnpm.io/supply-chain-security>
- pnpm: <https://pnpm.io/settings/dependency-resolution>
- GitHub: <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository>
- GitHub: <https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review>
- Node.js: <https://nodejs.org/en/about/previous-releases>
- npm registry metadata: `pnpm`、`wrangler`、`miniflare`、`@cloudflare/vitest-plugin` の `/latest`

二次情報(判断の根拠にはしていない)。

- `npm.flatt.tech` と Takumi Guard に関する検索結果
  (<https://deepwiki.com/flatt-security/setup-takumi-guard-npm> ほか)。
