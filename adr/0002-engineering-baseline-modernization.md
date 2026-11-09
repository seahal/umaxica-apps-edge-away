# ADR 0002: Away 自身の engineering baseline を確立する

Status: **Proposed** (2026-10-07).
この ADR は、検討中の原則を記録する。
原則も、それに伴う個別の改善も、まだ採用されていない。
設定とコードは変更していない。

- 現状の証拠: [memos/2026-10-07-engineering-baseline-audit.md](../memos/2026-10-07-engineering-baseline-audit.md)
- 改善候補の backlog: [plans/2026-10-07-engineering-baseline-hardening.md](../plans/2026-10-07-engineering-baseline-hardening.md)

番号について。
依頼時の想定は `0001` だったが、[ADR 0001](0001-independent-away-responsibility.md) が既に存在するため `0002` とした。

## Context

Away の tooling と CI は、Jump の engineering baseline から port して立ち上げた。
Jump のアプリケーションコード、鍵、JWKS、registry は意図的に port していない。

port によって、Away は初日から次のものを得た。
exact に pin された Node と pnpm、frozen lockfile、install script の拒否、release age の制限、
commit SHA で pin された Action、`contents: read` だけで動く CI、99% の coverage threshold、
workerd 上の runtime check、wrangler の dry-run である。
これらは現在すべて動作しており、CI は success している。

一方で、port は Jump の判断も一緒に運んだ。
2026-10-07 の調査で、次の値が Jump と同一であることを確認した。

- `compatibility_date: 2026-05-26` と `nodejs_compat`
- Node `24.20.0` と pnpm `12.0.0`
- registry `npm.flatt.tech`
- `.worktreeinclude` と `dependabot.yml` の comment

Jump にとって、これらは既存の本番挙動を固定するための値である。
Away には、固定すべき既存の挙動がまだない。
runtime は `GET /health` だけを返す scaffold で、binding も state も持たない。

この非対称が、この ADR の動機である。
Away は新規で、小さく、stateless な Worker である。
互換のための設定を無条件に継承し続けるより、Away 自身の baseline を一度意識的に決める方が安い時期にいる。
本体が実装され、deploy された後は、同じ変更に検証と rollback の計画が必要になる。

ただし、調査は次のことも示した。

- 継承した値の多くは、変える理由が見つかっていない。「Jump 由来である」ことは、変える理由にならない。
- 導入済みの防御の一部は、機能しているかを確認できていない。
  `minimumReleaseAge` は registry が返す metadata に依存するが、その registry の挙動は未確認である。
- Cloudflare が現在案内する test tooling は、Away が使う Vitest の major と peer dependency が合わない可能性がある。
- 本番 response の header を最終的に決める層が、Worker なのか zone なのかが分かっていない。

したがって、ここで決めようとしているのは「何を新しくするか」ではない。
「Away の baseline を、どういう原則で維持するか」である。

## Decision under consideration

次の 6 つの原則を検討している。
どれも **Accepted ではない**。

### 1. 継承した値は、Away の理由が付くまで「未決定」として扱う

Jump から来た設定は、そのまま使い続けてよい。
ただし、Away の文書に理由が書かれるまでは、決定事項ではなく初期値とみなす。
理由が付けば、値が変わらなくても Away の決定になる。

### 2. exact version pin を維持し、更新の契機を定義する

Node と pnpm の exact pin、`packageManager` の hash、`pmOnFail: error` は維持する。
そのうえで、誰が、いつ、何を見て更新するかを文書にする。
pin は「更新しない」ことではなく、「更新を意図した時点に限る」ことである。
契機のない pin は、時間とともに陳腐化と区別できなくなる。

### 3. Cloudflare runtime compatibility を意識的に管理する

`compatibility_date` と compatibility flags は、Away が選んだ値として持つ。
更新するかどうか、いつ更新するかを、Cloudflare の更新手順(変更された flag の確認と test)に沿って判断する。
Cloudflare は古い date を無期限に支えると述べており、更新は義務ではない。
新しい date にすること自体は目的にしない。

### 4. サポートされている公式 tooling を、要件を満たす場合に優先する

Cloudflare が現在サポートしている tooling が、Away の検証要件を満たし、
既存の toolchain と両立する場合は、独自の仕組みよりそれを優先する。
満たさない場合は、現在動作している方式を維持する。
`unstable_*` の API や prerelease への依存は、誤りではなく保守コストとして記録し、定期的に見直す。

### 5. CI と production contract の役割を分離する

CI が保証するのは、コードと設定が local の runtime で期待どおりに動くことである。
本番 response の性質(header、route、zone の rule)は、CI が保証する範囲に含めない。
本番の contract は、所有する層を特定したうえで、別の手段で確認する。
同じ内容を検査する check が複数ある場合は、実行環境と検出時点の違いを明示し、
違いを説明できないものは増やさない。

### 6. supply-chain 防御を多層にし、各層の実効性を確認する

registry、resolve、install、既知の脆弱性の検出、CI の Action、secret の検出、という層ごとに防御を置く。
ただし、層を増やすことより、既にある層が機能していると確認できることを優先する。
新しい設定は、既存の層で防げない攻撃を具体的に挙げられ、かつ拒否の動作を観察できる場合に限って加える。

## Alternatives

### A. 現状を維持し、Jump に追従する

Jump の baseline を正とし、Jump の更新を定期的に Away に写す。

- 利点: 判断が不要である。2 つの repository の設定が揃い、知識を共有できる。
- 欠点: Jump の互換上の都合が Away を拘束する。
  同期の手段がなく、調査時点で既にずれている(Jump は miniflare と wrangler を更新済み、
  Away は CI に型生成の step を追加済み)。

### B. 継承した値をすべて現在の最新に更新する

date を現在日に、Node と pnpm を latest に、test tooling を公式のものに置き換える。

- 利点: 一度で「新しい状態」になる。
- 欠点: 更新のための更新である。
  公式の Vitest plugin は Vitest 5 と両立しない可能性があり、置換が後退になり得る。
  複数の変更を同時に行うと、失敗の原因を切り分けられない。
  「最新」は数週間で最新ではなくなり、原則が残らない。

### C. baseline を共有の設定 package または template に切り出す

Jump、Away、その他の edge family で共通の設定を 1 か所で管理する。

- 利点: 同期の問題が構造的に解決する。
- 欠点: 3 つ目の保守対象が生まれる。
  Away が Jump と違う値を選ぶ余地が減り、この ADR の動機と逆方向である。
  repository が 2 つの段階では、抽象化のコストが利益を上回る(YAGNI)。

### D. 本体の実装が終わるまで基盤には触れない

基盤の検討をすべて延期し、機能の実装に集中する。

- 利点: 当面の作業量が最も少ない。
- 欠点: compatibility date、response header の所有者、deploy の方針は、本体の実装後に変える方が高くつく。
  特に header の所有者が不明なまま cushion page を実装すると、test と本番が食い違う可能性がある。

検討中の原則は、A と D の中間にある。
変える理由のないものは変えず、後で変えると高くつくものだけを先に決める。

## Consequences

原則が採用された場合に見込まれる結果である。

### 得られるもの

- 設定の値に、Away の文脈での理由が付く。半年後に読む人が、継承なのか決定なのかを判別できる。
- 更新の契機が定義され、pin が陳腐化と区別できるようになる。
- CI が何を保証し、何を保証しないかが明確になり、「CI は通ったが本番で違う」ことの説明がつく。
- 防御の層ごとに、機能しているかどうかの証拠が残る。

### 負うもの

- Jump と Away の設定が意図的に分かれる。片方の知識がもう片方にそのまま当てはまらなくなる。
- 理由を書く作業が発生する。値を変えない場合にも発生する。
- 定期的な更新の作業が発生する。Away は機能としては小さいが、基盤の保守は機能の大きさに比例しない。
- 原則 4 は、公式 tooling が要件を満たさない間、現在の方式の保守コストを受け入れることを意味する。
- 原則 6 は、設定を足すより確認する方を優先するため、短期的には「防御を追加した」という成果が出にくい。

### 変わらないもの

- この ADR が Accepted になっても、個別の変更は backlog の項目ごとに別途判断する。
  ADR の採用は、backlog の一括採用を意味しない。
- Jump のコード、鍵、JWKS、registry、rate-limit namespace を Away に持ち込まない方針は、
  [ADR 0001](0001-independent-away-responsibility.md) と AGENTS.md のとおりである。

## Open Questions

採否の前に答えが必要なもの、または採用後も残るものである。

1. **registry は `minimumReleaseAge` と `trustPolicy` に必要な metadata を返すか。**
   返さない場合、原則 6 の前提となる層の一部が機能していない。backlog の P0-2。
2. **本番 response の security header を付与しているのはどの層か。**
   zone 側であれば、原則 5 の「所有する層」が Away の repository の外にある。backlog の P0-3。
3. **Away 本体は Node.js API を必要とするか。**
   必要としないなら `nodejs_compat` を外せるが、新しい compatibility date では自動で有効になる可能性がある。
   その記述は公式文書の原文で確認していない。
4. **Cloudflare の Vitest plugin は Vitest 5 に対応しているか。**
   していない場合、原則 4 の「既存の toolchain と両立する」を満たさない。
5. **`createTestHarness()` は安定した API か。workerd 上で wrangler の build 出力を実行するか。**
   事実であれば、実行する bundle と deploy する bundle の不一致を解消できる。
6. **Dependabot は Node と pnpm 本体、`catalog:` 指定、proxy registry を扱えるか。**
   原則 2 の更新の契機を、どこまで自動化できるかが決まる。
7. **Jump との同期を完全にやめるのか、参照だけは続けるのか。**
   Jump で見つかった問題(undici の override のようなもの)を、Away がどう知るか。
8. **deploy を手動のままにするか。**
   自動化は、現在 secret を 1 つも必要としない CI に、Cloudflare の書き込み権限を持ち込む。
9. **開発体制は単独のままか。**
   approval count 0、bypass actor なし、という ruleset の妥当性はこれに依存する。
10. **基盤の定期更新に、どれだけの作業を割けるか。**
    割けないなら、原則 2 は定義だけが残る。その場合は pin を緩める方が正直な選択かもしれない。
11. **「Git Worktree を使わない」方針を、どこに記録するか。**
    現在は `.worktreeinclude` が存在し、方針は repository 内に書かれていない。

## この ADR を Accepted にする条件(案)

- Open Questions の 1 と 2 に、観察にもとづく答えが出ている。
- 6 つの原則のそれぞれについて、採用、修正、不採用のいずれかが決まっている。
- 原則 2 の更新の契機が、具体的な頻度または条件として書かれている。
