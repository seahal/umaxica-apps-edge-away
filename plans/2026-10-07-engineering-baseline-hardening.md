# Engineering baseline hardening backlog (2026-10-07)

Away の基盤を後日改善するための backlog である。
実装計画ではなく、何を、なぜ、どの順で検討するかの材料を残す。
ここに書かれた項目はどれも採用済みではない。

- 現状の証拠: [memos/2026-10-07-engineering-baseline-audit.md](../memos/2026-10-07-engineering-baseline-audit.md)
- 検討中の原則: [ADR 0002](../adr/0002-engineering-baseline-modernization.md)(Proposed)

## 追加調査による更新(2026-10-07、同日)

memo の 14 節に追加調査の結果がある。以下の項目は、その結果で前提が変わった。
各項目の本文は初回調査時点のままなので、この表を優先して読むこと。

| ID   | 変わった点                                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| P0-2 | registry は `time` と provenance を返すと確認した。最大の懸念は解消した。残りは拒否動作の観察、tarball の経路、audit、可用性で、P1 相当に下がる |
| P0-1 | `2026-08-04` 以降の date では `nodejs_compat` が既定で有効になると確認した。date を上げる場合、flag を消すだけでは Node.js 互換は外れない |
| P1-2 | `createTestHarness()` は install 済みの `wrangler@4.145.0` に既にあり、依存の追加なしで試作できる。Vitest plugin は Vitest 5 を peer に含まない |
| P1-4 | `trustPolicy` の前提(registry が trust evidence を返すこと)は `hono` で確認できた。即採用ではないが、評価に進める状態になった       |
| P2-4 | override の原因は直接 pin の `miniflare@5.20260926.0-alpha` だけである。`wrangler` の要求する版に揃えれば、override と重複 install が同時に消える |

## 優先度の意味

| 優先度 | 意味                                                                                 |
| ------ | ------------------------------------------------------------------------------------ |
| P0     | Away 本体の実装前に答えを出す価値がある。後になるほど変更のコストか影響が大きくなる   |
| P1     | 本体の実装と並行して検討できる。効果はあるが、遅れても損失は小さい                    |
| P2     | 整理と衛生。または、条件が揃うまで着手しないもの                                      |

P0 は 3 件とも、最初の作業が「調査」または「決定」であり、コード変更ではない。
調査の結果、何も変更しないという結論もあり得る。

## 全項目に共通する注意

- 新しい版であることは採用理由にならない。各項目の「なぜ検討するか」が成り立たなければ見送る。
- CI の check を増やす項目は、既存のどの検出と重なるかを先に確認する。
  `main` の required check は既に 7 件あり、bypass actor はいない。
- 1 つの PR で 1 項目だけを扱う。toolchain の更新と設定の変更を混ぜると、失敗の原因を切り分けられない。
- 検証は AGENTS.md の handoff 手順
  (`format:check`、`lint:check`、`typecheck`、`test:cov`)と CI の 7 job を基準にする。
- memo の「Needs verification」は、その項目に着手する時点で再確認する。
  版番号と公式の推奨は 2026-10-07 時点の値である。

## 一覧

| ID   | 項目                                               | 最初の作業 |
| ---- | -------------------------------------------------- | ---------- |
| P0-1 | Cloudflare compatibility policy                    | 決定       |
| P0-2 | registry と pnpm supply-chain policy の実効性確認  | 調査       |
| P0-3 | Cloudflare response-header ownership               | 調査       |
| P1-1 | Workers 型生成と型 drift 検出                      | 決定       |
| P1-2 | Cloudflare 公式 test tooling の評価                | 調査       |
| P1-3 | Node / pnpm 更新ポリシー                           | 決定       |
| P1-4 | pnpm supply-chain policy の追加設定                | 調査       |
| P1-5 | manual deployment policy                           | 決定       |
| P1-6 | GitHub Actions policy enforcement                  | 設定       |
| P2-1 | Dependency Review                                  | 評価       |
| P2-2 | CodeQL / code scanning                             | 評価       |
| P2-3 | `.worktreeinclude` と worktree 不使用方針の不整合  | 決定       |
| P2-4 | 依存の整理(undici override、miniflare の重複)   | 更新時に実施 |
| P2-5 | required check と ruleset の運用方針               | 決定       |

---

## P0-1 Cloudflare compatibility policy

**なぜ検討するか。**
`compatibility_date: 2026-05-26` と `nodejs_compat` は Jump から継承した値で、Away が選んだものではない。
Away は新規の Worker であり、固定すべき既存の挙動が `/health` しかない。
本体を実装した後に date を動かすと、検証すべき挙動が増える。
起点を決めるなら、本体の実装前が最も安い。

**前提条件。**

- `2026-05-26` から現在までに既定になった compatibility flag の一覧を、公式文書の原文で確認する。
  memo の取得結果は網羅性が疑わしい。
- 「`2026-08-04` 以降は `nodejs_compat` が自動で有効になる」という記述を原文で確認する。
- Away 本体が Node.js API を必要とするかの見込み。未定なら flag の扱いは延期する。

**決めること。**

1. Away の起点となる date。選択肢は、現状維持、本体実装の開始日、Jump と同期、の 3 つである。
2. 更新の契機。定期(例: 四半期)、wrangler の更新時、必要な機能が出たとき、のどれか。
3. `nodejs_compat` を明示し続けるか。

**変更対象になり得るファイル。**
`wrangler.jsonc`、`README.md`、date を決めた理由を記録する ADR。

**検証方法。**
`test:worker` は `wrangler.jsonc` から date と flags を読むため、変更は workerd 上の検証に自動で反映される。
`cloudflare:check`、`types:generate` 後の `typecheck` も実行する。
生成される型は date に依存するため、型 error が出れば挙動の変化の手がかりになる。

**完了条件。**
date と flags の値、その理由、更新の契機が repository 内の文書に書かれている。
値が変わらなくても、「決めた」ことが記録されていれば完了とする。

**rollback / compatibility 上の注意。**

- date は戻せる。ただし本番に deploy した後は、戻すこともまた挙動の変更である。
- Cloudflare は古い date を無期限に支えると述べている。更新は義務ではない。
- Jump と date を揃える必要はない。両者は別の Worker であり、互いの runtime 挙動に依存しない。
- local の workerd が、指定した date を扱えるほど新しいことが必要になる。
  date を現在日に近づけるほど、`miniflare` / `workerd` の更新と連動する。

## P0-2 registry と pnpm supply-chain policy の実効性確認

**なぜ検討するか。**
`minimumReleaseAge: 4320` は registry metadata の `time` field に依存する。
pnpm の既定では、`time` がない場合に検査を黙って skip する(`minimumReleaseAgeIgnoreMissingTime: true`)。
Away の registry は `npm.flatt.tech` であり、この field を返すかを確認していない。
導入済みの防御が機能していない可能性があり、これは新しい防御を足すより先に確認すべきである。

**前提条件。**
registry への読み取り request ができること。credential は不要なはずである。

**調査すること。**

1. `npm.flatt.tech` が返す package metadata に `time` field があるか。
2. provenance と trusted publisher の情報が upstream と同じ形で返るか。
3. `pnpm audit` がこの registry に対して何を問い合わせ、結果が npmjs.org と一致するか。
4. registry が停止したときの CI の挙動。
5. pin している pnpm `12.0.0` での各設定の既定値。memo が引用した文書の対応版は未確認である。
6. registry 運営元の公式な仕様文書の所在。

**変更対象になり得るファイル。**
調査だけなら変更はない。
結果によっては `pnpm-workspace.yaml`(`minimumReleaseAgeIgnoreMissingTime`、`minimumReleaseAgeStrict` の明示)と `.npmrc`。

**検証方法。**
公開直後の版だけが存在する条件を作り、`minimumReleaseAge` によって resolve が拒否されることを観察する。
本番の `pnpm-lock.yaml` を変更しないよう、repository の外の一時 directory で行う。

**完了条件。**
「`minimumReleaseAge` は現在の registry で機能している / いない」を、観察にもとづいて memo に追記できる。

**rollback / compatibility 上の注意。**

- `minimumReleaseAgeIgnoreMissingTime: false` にすると、`time` を返さない package で install が失敗する。
  CI の全 job が install に依存するため、失敗は全面的になる。
- registry を npmjs.org に戻す案は、proxy が提供する悪性 package の block を失う。
  どちらの防御を優先するかは別の判断である。
- Jump も同じ registry を使う。調査結果は Jump にも当てはまるが、Jump の設定はこの backlog の対象外である。

## P0-3 Cloudflare response-header ownership

**なぜ検討するか。**
Worker が設定していない `X-Frame-Options`、`Referrer-Policy`、`X-XSS-Protection` が
本番 response に付いていたという報告がある。今回は再現を取れていない。
cushion page では framing の可否と referrer の扱いが機能要件になる。
どの層が最終的な header を決めるのかが不明なままでは、Worker 側の実装も test も本番を保証しない。

**前提条件。**

- 本番への読み取り request(`curl -I`)の許可。
- Cloudflare dashboard または API の読み取り権限。設定の変更は不要であり、行わない。

**調査すること。**

1. 現在の本番 response header を記録する(`/health` と存在しない path の両方)。
2. zone `umaxica.net` の Managed Transforms、Response Header Transform Rules、
   その他 header を変更し得る設定を読み取り、付与元を特定する。
3. その設定が zone 全体に効くのか、`away.umaxica.net` に限定されているのか。
4. その設定の所有者。Away の repository の外で管理されているなら、変更の経路を確認する。
5. Worker が同じ header を設定したとき、zone 側が上書きするのか、追加するのか、重複するのか。

**決めること。**
security header の権威を Worker に置くか、zone に置くか、分担するか。
これは本体の要件(framing、referrer)が決まってから判断する。
この項目の範囲は、判断に必要な事実を揃えるところまでである。

**変更対象になり得るファイル。**
調査だけなら memo への追記のみ。
決定後は `src/`(header middleware)、`test/`、`e2e/`、責務を記録する ADR。

**検証方法。**
local(`test:worker`)の response header と、本番の response header を並べて差分を取る。
差分がすべて説明できれば、所有者が特定できたことになる。

**完了条件。**
本番 response の各 security header について、付与している層と設定の所在が文書化されている。

**rollback / compatibility 上の注意。**

- zone の設定は Away 以外の hostname にも効いている可能性がある。Away の都合で変更すると他の service に影響する。
- header の実装を Worker に足す前にこの調査を終える。順序を逆にすると、test は通るが本番では違う、という状態を作る。
- `X-XSS-Protection` は現在の browser では意味を持たないとされる。
  ただし「消すべきか」は所有者が判明してからの話である。

---

## P1-1 Workers 型生成と型 drift 検出

**なぜ検討するか。**
CI は `types:generate` の直後に `types:check` を実行するため、check は drift を検出していない。
README もこれを認めている。
また `worker-configuration.d.ts` がないと local の `typecheck` が通らない。

**前提条件。**
P0-1 の結論。生成される型は compatibility date と flags に依存する。

**選択肢。**

| 案                                   | 利点                                                    | コスト                                                             |
| ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------ |
| A. 現状維持(生成物を commit しない) | 生成物の diff が PR に現れない                          | `types:check` は実質的に何も検査しない。local で事前の生成が必要   |
| B. 生成物を commit し、CI は check のみ | `--check` が drift を検出する。clone 直後に typecheck できる | wrangler の更新ごとに大きな diff が出る。Dependabot の PR が失敗し得る |
| C. commit せず、`types:check` を CI から外す | 意味のない step が減る                           | 生成の成否は `types:generate` が既に検査している                   |

Cloudflare の文書は、生成物の commit を任意とし、`--check` を commit 済みの型の検証用として説明している。

**変更対象になり得るファイル。**
`.github/workflows/integration.yaml`、`.gitignore`、`.oxfmtrc.json`、`.oxlintrc.json`、
`README.md`、`worker-configuration.d.ts`(B の場合)、`pnpm-workspace.yaml` と `package.json`
(`@cloudflare/workers-types` が不要と確認できた場合)。

**検証方法。**
B の場合、`wrangler.jsonc` の date を変えた branch で `types:check` が失敗することを確認する。

**完了条件。**
`types:check` が何を保証するのかを一文で説明でき、README の記述と一致している。

**rollback / compatibility 上の注意。**

- B は wrangler の更新 PR(Dependabot)を、型の再生成なしには merge できなくする。
  更新の手間が増えることを受け入れるかが判断の中心である。
- `@cloudflare/workers-types` の削除は、`wrangler` の optional peer dependency であることと、
  `autoInstallPeers: false` であることを踏まえて確認する。

## P1-2 Cloudflare 公式 test tooling の評価

**なぜ検討するか。**
`scripts/test-worker.mjs` は動作しているが、`unstable_readConfig`、`convertV4MiniflareOptions`、
`miniflare` の `-alpha` 版という、安定とは言えない 3 つに依存している。
また esbuild で独自に bundle するため、実行される bundle は deploy される bundle と一致しない。
Cloudflare は現在、`@cloudflare/vitest-plugin` と wrangler の `createTestHarness()` を案内している。

これは置換の提案ではない。現在の方式は CI で success しており、誤りではない。
検討するのは、公式の方式が上の 2 点(API の安定性、bundle の一致)を実際に改善するかどうかである。

**前提条件(すべて未確認)。**

- `@cloudflare/vitest-plugin`(確認時 `1.3.6`)の peer dependency は `vitest ^4.1.0` である。
  Away は `vitest 5.0.2` を使う。Vitest 5 への対応状況を確認する。
- `createTestHarness()` の安定度、必要な wrangler の版、workerd 上で実行されるか。
- どちらも package 名と API 名は変わり得る。着手時に公式文書を読み直す。

**比較の観点。**

| 観点                   | 現在(Miniflare 直接)                 | Vitest plugin                          | `createTestHarness()`                |
| ---------------------- | -------------------------------------- | -------------------------------------- | ------------------------------------ |
| 実行される bundle      | esbuild による独自 bundle              | Vite による変換(未確認)              | wrangler の build 出力(文書による)  |
| 依存する API の安定度  | `unstable_*` と alpha                  | prerelease の印あり                    | 未確認                               |
| Vitest との関係        | 無関係(Node script)                  | Vitest の版に拘束される                | 任意の test runner                   |
| coverage 99% への影響  | なし                                   | coverage の取得方法が変わり得る        | なし                                 |
| 追加する依存           | `miniflare`、`esbuild`(直接依存)     | plugin を追加                          | なし(wrangler に含まれる)          |
| 削除できる依存         | —                                      | 未確認                                 | `miniflare`、`esbuild` の直接依存を外せる可能性 |

`createTestHarness()` が文書どおりなら、Playwright の対象を Node server から Worker に変えられる可能性もある。
その場合 `e2e/server.ts` と `@hono/node-server` の位置づけが変わる。これも評価の対象に含める。

**変更対象になり得るファイル。**
`scripts/test-worker.mjs`、`package.json`、`pnpm-lock.yaml`、`vitest.config.ts`、
`playwright.config.ts`、`e2e/server.ts`、`.github/workflows/integration.yaml`、`README.md`。

**検証方法。**
別 branch で試作し、現在の `test:worker` が検査している 3 点
(`/health` が 200、未定義 path が 404、`redact_query_string` が `true`)を同じく検査できることを確認する。
CI の所要時間を、現在の約 1 分 30 秒と比較する。

**完了条件。**
採用、見送り、再評価の時期のいずれかが、理由とともに記録されている。
「Vitest 5 に未対応なので見送り、対応後に再評価する」は有効な完了である。

**rollback / compatibility 上の注意。**

- Vitest を plugin に合わせて downgrade するのは、公式 tooling の採用と引き換えに別の依存を古くすることになる。
  その取引が妥当かを明示的に判断する。
- 移行する場合、新旧の check を一時的に併走させ、新方式が同じ障害を検出することを確認してから旧方式を外す。
- `worker-runtime` は required check である。job 名を変えると ruleset の更新も必要になり、
  その間 `main` への merge が止まる。
- script 冒頭の「workerd を Node だけの fake に置き換えない」という制約は、方式を変えても維持する。

## P1-3 Node / pnpm 更新ポリシー

**なぜ検討するか。**
exact pin は意図的だが、更新の契機が定義されていない。
確認時点で Node は `24.20.0`(upstream `24.21.0`)、pnpm は `12.0.0`(upstream `12.9.1`)である。
Dependabot がこの 2 つを更新するかは確認していない。
また local の版が違うと `pnpm` が動かず、今回の調査でも script を実行できなかった。

**前提条件。**

- `24.20.0` → `24.21.0`、`12.0.0` → `12.9.1` に security fix が含まれるかの確認。
- Dependabot が `engines` と `packageManager` を更新対象にするかの確認。

**決めること。**

1. 更新の契機。security release は即時、それ以外は定期、という分け方が候補になる。
2. 版を書く場所。現在は pnpm が 2 か所(`engines.pnpm`、`packageManager`)、Node が 1 か所である。
3. local の版を揃える手段を repository に置くか(`mise.toml` など)。
   現在は README に `mise exec …` の案内があるだけである。
4. Node の major を上げる基準。LTS だけを使うか。

**変更対象になり得るファイル。**
`package.json`、`pnpm-lock.yaml`、`README.md`、`AGENTS.md`、`.github/dependabot.yml`、
追加する場合は version file。

**検証方法。**
更新 PR で CI の 7 job が success すること。
pnpm を上げるときは、lockfile の差分が意図した範囲に収まっていることを確認する。

**完了条件。**
「誰が、いつ、何を見て Node と pnpm を上げるか」が文書に書かれている。

**rollback / compatibility 上の注意。**

- pnpm の更新は設定の既定値を変えることがある。P0-2 の結果と合わせて確認する。
- `packageManager` の hash は版ごとに異なる。手で書かず、pnpm が出力する値を使う。
- wrangler の `engines.node` は `>=22.0.0` である(確認時)。Node 24 はこの範囲にある。
- version file を追加すると、版の記載箇所がさらに増える。
  `package.json` を唯一の出所とする現在の方針と両立するかを確認する。

## P1-4 pnpm supply-chain policy の追加設定

**なぜ検討するか。**
pnpm は `trustPolicy`、`blockExoticSubdeps`、`minimumReleaseAgeStrict` などの設定を提供している。
Away は一部を既定値に任せている。
既定値は pnpm の更新で変わり得るため、依存している既定値を明示する価値があるかを検討する。

**前提条件。**
P0-2 の完了。registry が必要な metadata を返すかが分からないまま、ここに進んではならない。

**候補。**

| 設定                          | 現在             | 検討内容                                                                 |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------ |
| `blockExoticSubdeps`          | 未設定(既定 `true`) | 既定に依存せず明示するか                                              |
| `minimumReleaseAgeStrict`     | 未設定           | 条件を満たす版がないときに失敗させるか                                   |
| `trustPolicy: no-downgrade`   | 未設定(既定 `off`) | registry が trust evidence を返すと確認できた場合に限り評価する        |
| `ignoreScripts` と `allowBuilds` の二重指定 | 両方あり | 意図した多重防御か、片方で足りるかを確認する                    |

`trustPolicy` は即採用しない。
registry が provenance を透過しない場合、検査が常に通るか、常に失敗するかのどちらかになり、
どちらも防御として機能しない。

**変更対象になり得るファイル。**
`pnpm-workspace.yaml`、必要なら `pnpm-lock.yaml`。

**検証方法。**
設定ごとに、`pnpm install --frozen-lockfile` が成功することと、
設定が拒否すべき条件を実際に拒否することの両方を確認する。
後者を確認できない設定は、導入しても効果を主張できない。

**完了条件。**
採用した設定のそれぞれについて、何を防ぎ、どう確認したかが `pnpm-workspace.yaml` の comment か文書に書かれている。

**rollback / compatibility 上の注意。**

- `trustPolicy` は `trustPolicyExclude` の保守を生む。例外の list は override と同じ種類の負債になる。
- 設定を厳しくすると、Dependabot の PR が install で失敗するようになる可能性がある。
- 設定の追加は「層を増やす」ことであり、それ自体は目的ではない。
  既存の層(registry proxy、release age、lockfile、script 拒否)で防げない攻撃を具体的に挙げられる場合に限る。

## P1-5 manual deployment policy

**なぜ検討するか。**
deploy は手動で、CI は dry-run までである。
誰が、どの端末から、どの認証で deploy するか、deploy 済みの version がどの commit かは、repository に記録がない。
本体が稼働すると、Away は外部遷移の経路上に置かれ、停止と誤動作の影響が大きくなる。

**前提条件。**
本体の実装が deploy 可能な段階に近づいていること。それまでは方針の検討だけでよい。

**決めること。**

1. 手動 deploy を続けるか、自動化するか。
2. 手動の場合の手順。どの branch の、どの状態から deploy するか。
3. 自動の場合の認証方式。長期の API token を GitHub に置くか、他の方式があるか。
   Cloudflare が現在何を提供しているかは未調査である。
4. GitHub environment と protection rule を使うか。現在 environment は 0 件である。
5. rollback の手段。wrangler の version / rollback 機能、gradual deployment の利用。
6. deploy 後の確認。`version_metadata` binding は定義済みだが、未使用である。
   `/health` が deploy された version を返すようにすれば、commit との対応を外から確認できる。

**変更対象になり得るファイル。**
`README.md`、運用手順の文書、`package.json`(deploy script)、
自動化する場合は `.github/workflows/` の新しい workflow と `src/index.ts`。

**検証方法。**
手順どおりに deploy と rollback を 1 回ずつ実施し、所要時間と確認方法を記録する。

**完了条件。**
初めての担当者が文書だけで deploy と rollback を実施できる。

**rollback / compatibility 上の注意。**

- 自動 deploy は、CI に Cloudflare の書き込み権限を持つ credential を置くことを意味する。
  現在の CI は `contents: read` だけで動いており、secret を 1 つも必要としない。
  この性質を失うことが最大のコストである。
- deploy workflow を足す場合、PR(特に fork と Dependabot)から credential に到達できないことを確認する。
- 単独開発の小さな Worker では、手動 deploy と手順書の組が妥当な結論になり得る。

## P1-6 GitHub Actions policy enforcement

**なぜ検討するか。**
SHA pin は workflow の書き方として守られているが、repository 設定は
`allowed_actions: all`、`sha_pinning_required: false` である。
規約は将来の変更で破られ得る。
GitHub は SHA pin を設定として強制する機能を提供しており、
現在の workflow は既にその条件を満たしているため、導入のコストが小さい。

**前提条件。**
repository の admin 権限。設定の変更は今回の調査の範囲外であり、実施していない。

**候補。**

1. "Require actions to be pinned to a full-length commit SHA" を有効にする。
2. `allowed_actions` を `selected` にし、使用中の 4 つの Action の owner だけを許可する。

**変更対象になり得るファイル。**
repository の設定のみ。file の変更はない。
設定を記録するなら `README.md` か運用文書。

**検証方法。**
設定の変更後、既存の workflow が全 job で success すること。
tag 参照の Action を使う試験用の branch で、workflow が拒否されることを確認する。

**完了条件。**
`gh api repos/{owner}/{repo}/actions/permissions` の出力が、決めた方針と一致している。

**rollback / compatibility 上の注意。**

- GitHub の文書によれば、local action(`./.github/actions/pnpm-project`)は対象外である。
  ただし composite action の内部で使う外部 Action に強制が及ぶかは確認していない。
- allow-list は、Dependabot が新しい owner の Action を提案したときに保守が必要になる。
  Action が 4 つしかない現状では、list の保守より SHA pin の強制だけの方が費用対効果が高い可能性がある。
- 設定は repository の外(file にない場所)に置かれる。変更の履歴が git に残らない。
- どちらも設定を戻せば即座に元に戻る。

---

## P2-1 Dependency Review

**なぜ検討するか。**
PR が持ち込む依存の変更を、merge 前に検査できる。
public repository では追加費用なしで使えるとされる。

**既存の検出との重なり。**
`dependencies` job の `pnpm audit` は全 run で lockfile 全体を検査し、required check である。
Dependabot alerts も有効である。
Dependency Review が追加で提供するのは、PR の差分に限定した表示と license の検査である。
脆弱性の検出については、既存の 2 つとほぼ同じ advisory を見ることになる。

**前提条件(未確認)。**

- dependency graph が pnpm 12 の lockfile を解析できるか。
- `catalog:` 指定と `overrides` を正しく扱えるか。

**変更対象になり得るファイル。**
`.github/workflows/` の新規または既存の workflow、ruleset の required check。

**検証方法。**
既知の advisory がある版を追加する試験用の PR で、検出されることを確認する。

**完了条件。**
採用する場合は、`pnpm audit` との役割分担が文書化されている。
見送る場合は、その理由が記録されている。

**rollback / compatibility 上の注意。**

- license 検査に価値を見出すなら、採用の理由になる。脆弱性の検出だけが目的なら重複が大きい。
- required check に加えるかは別に判断する。まず required にせずに運用する方法もある。
- `pnpm audit` を Dependency Review で置き換える案は、
  `pnpm audit` が registry proxy 経由で動いている点(P0-2)を確認してから検討する。

## P2-2 CodeQL / code scanning

**なぜ検討するか。**
Away 本体は、信頼できない URL を受け取り、検証し、redirect 先として扱う。
open redirect と injection は data flow の問題であり、静的解析が得意とする領域である。
code scanning の default setup は現在 `not-configured` で、
対象言語として `actions`、`javascript-typescript` が検出されている。

**なぜ今ではないか。**
現在の source は 2 file、約 20 行で、解析する data flow がない。
本体の URL 検証が実装されてから有効にする方が、得られる情報が多い。

**前提条件。**
本体の入力処理が実装されていること。

**選択肢。**

- default setup。file の追加が不要で、保守が最も軽い。
- advanced setup(workflow file)。query や trigger を調整できるが、SHA pin と保守の対象が増える。

**変更対象になり得るファイル。**
default setup なら repository の設定のみ。advanced なら `.github/workflows/` の新規 file。

**検証方法。**
有効化の後、最初の解析結果を確認し、誤検出の量を見る。

**完了条件。**
採用する場合は、alert への対応方針(誰が、いつまでに見るか)が決まっている。

**rollback / compatibility 上の注意。**

- alert を誰も見ないなら、導入しても効果はない。単独開発では、見る人が 1 人であることを前提に量を評価する。
- `actions` 言語の解析は、workflow 自体の問題(権限、injection)を検出する。
  これは本体の実装を待たずに価値があり得る。ただし workflow は現在 1 file である。
- required check にすると、解析の所要時間が全 PR に加わる。

## P2-3 `.worktreeinclude` と worktree 不使用方針の不整合

**なぜ検討するか。**
この project は Git Worktree を使わない方針だが、worktree 用の設定 file が commit されている。
内容は Jump の同名 file と同一で、port の際に持ち込まれたものと見られる。
また file の指定は `.env`、`.dev.vars`、`.secrets/` などを新しい worktree に複製するものである。
worktree が誤って使われた場合、secret の複製先が増える。

**前提条件。**
方針の確認。「worktree を使わない」は repository 内のどこにも書かれていない。

**選択肢。**

- A. `.worktreeinclude` を削除し、AGENTS.md に「Git Worktree は使用しない」と明記する。
- B. file を残し、方針を「使ってもよい」に改める。
- C. file を残し、方針も書かない(現状維持)。

**変更対象になり得るファイル。**
`.worktreeinclude`、`AGENTS.md`、`README.md`。

**検証方法。**
A の場合、`git worktree list` が主 worktree だけを返すこと、file を参照する tool や script がないことを確認する。

**完了条件。**
file の有無と、文書に書かれた方針が一致している。

**rollback / compatibility 上の注意。**

- 削除は git で戻せる。
- この file を読むのは特定の開発 tool である。Away の build、test、CI は参照していない。
- Jump 側の同名 file はこの backlog の対象外である。

## P2-4 依存の整理

**なぜ検討するか。**
memo で次の 3 点を確認した。

1. `undici@7.29.0` → `7.29.1` の override。upstream の `miniflare` は既に `7.29.1` に依存しており、
   Jump は override を削除済みである。
2. `miniflare` と `workerd` が lockfile に 2 版ずつある。
   直接依存の `miniflare` と、`wrangler` が要求する `miniflare` の版がずれているためである。
3. exact pin と caret が混在しており、基準が文書化されていない。

**前提条件。**
P1-2 の方向性。`miniflare` の直接依存をやめるなら、1 と 2 は同時に解消する。

**変更対象になり得るファイル。**
`package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`。

**検証方法。**
更新後の lockfile に `undici@7.29.0` が現れないこと、`miniflare` と `workerd` が 1 版ずつであること。
`pnpm audit --audit-level=high` と CI の 7 job が success すること。

**完了条件。**
override が不要なら削除されている。必要なら、その理由と削除の条件が comment に書かれている。

**rollback / compatibility 上の注意。**

- これは単独の作業ではなく、`wrangler` / `miniflare` を次に更新するときに一緒に行う。
- `miniflare` と `wrangler` の版を揃えるには、両方を同時に上げる必要がある。
  Dependabot が別々の PR にすると、また 2 版に分かれる。grouping の設定が候補になる。
- override は対象の版を限定しているため、残っていても害は小さい。急ぐ理由はない。

## P2-5 required check と ruleset の運用方針

**なぜ検討するか。**
現在の ruleset は妥当に動いているが、次の 3 点は方針として決まっていない。

1. approval count が 0 である。単独開発では合理的だが、体制が変わったときに見直す。
2. `dependencies` job が required check であり、bypass actor がいない。
   新しい advisory が公開されると、コードと無関係に `main` への merge が止まる。
3. `develop` は ruleset の対象外である。

**前提条件。**
開発体制の見通し(単独か、複数か、AI agent が PR を出すか)。

**決めること。**

- approval を必要とする条件。
- advisory で merge が止まったときの手順。override で回避する、required から外す、止まることを受け入れる、のどれか。
- `develop` を保護するか。

**変更対象になり得るファイル。**
repository の ruleset のみ。方針を記録するなら運用文書。

**検証方法。**
`gh api repos/{owner}/{repo}/rules/branches/main` の出力が方針と一致すること。

**完了条件。**
3 点のそれぞれについて、現状を維持する場合も含めて、理由が記録されている。

**rollback / compatibility 上の注意。**

- approval count 0 は欠陥ではない。変更は体制の変化に応じて行う。
- job 名は required check の context と一致している必要がある。
  workflow の job 名を変えるすべての作業(P1-2 を含む)は、ruleset の更新と同時に行う。
- bypass actor を足すことは、止まったときの逃げ道を作ると同時に、保護を弱める。

---

## 推奨する着手順

1. P0-2 と P0-3 の調査。どちらも変更を伴わず、他の項目の前提になる。
2. P0-1 の決定。本体の実装が進む前に行う。
3. P1-6。設定だけで済み、既存の workflow は条件を満たしている。
4. P1-3 と P2-4。次に toolchain と wrangler を更新する機会にまとめて扱う。
5. P1-1 と P1-2。P0-1 の結論と、公式 plugin の Vitest 5 対応を確認してから。
6. P1-5、P2-1、P2-2。本体が deploy 可能な段階に近づいてから。
7. P1-4。P0-2 の結果が出てから。
8. P2-3 と P2-5。いつでもよい。

## この backlog に入れなかったもの

- Away 本体の機能(URL 検証、cushion page、拒否契約)。
  [plans/away-external-navigation.md](away-external-navigation.md) の範囲である。
- Worker での security header の実装。P0-3 の結論が出るまで、責務の所在が決まらない。
- rate limiting、KV などの binding の追加。本体の要件が決まっていない。
- Jump の設定の変更。
