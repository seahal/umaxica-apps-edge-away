# Away の外部遷移機構の実装計画

Status: implementation may begin (2026-10-04).
許可された範囲は、Away 自身の外部リンクの open redirect 防止と cushion 本体である。
この文書の作成作業では、アプリケーション実装やデプロイは行わない。
責務の境界は [ADR 0001](../adr/0001-independent-away-responsibility.md) に従う。

## Jump との並行作業

Jump 側では external capability を段階的に撤去し、必須の `dst` を維持する internal-only gateway の準備を進めている。
Away は独立サービスとして実装を開始してよく、Jump の runtime 撤去完了を実装開始の条件にしない。
Jump の検証条件や停止状態を、この計画によって変更しない。

既存 scaffold は `/health` のみを提供する。
過去の scaffold 移植計画は履歴として残し、Away 本体の現在の責務は本計画と ADR 0001 を参照する。

## 最初に固定する契約

- 入力 URL を canonicalize し、不正な型、空値、NUL、危険な scheme、曖昧な encoding などを fail-closed で拒否する。
- 未検証の URL を自動 redirect せず、cushion で確認した URL と実際の遷移先を一致させる。
- malformed input を別 URL に silent fallback しない。
- 内部 URL も Away の URL validation と確認手順で処理し、検証を省略しない。
- 内部 URL を処理できても、Jump の issuer registry、内部 origin graph、trust broker、内部 RT の発行と検証を導入しない。
- Jump の承認 token、forwarding、RT exchange、compatibility bridge を前提にしない。
- 入力保護の方式と確認操作は Away 独自の契約として決め、Jump の鍵、JWKS、rate-limit namespace を流用しない。

## 実装の順序

1. 現在の scaffold、repository policy、正式な検証コマンドを確認する。
2. URL の入力契約、許可条件と拒否条件、cushion の確認操作を明文化する。
   署名の採用有無や具体的な入力形式は、この計画だけでは決めない。
3. 外部 URL、内部 URL、不正入力の契約テストを先に書き、意図した RED を確認する。
   EP/BVA に沿って missing、undefined、null、空値、0、NUL、型と encoding の境界を扱う。
4. URL validation と open redirect 防止を最小実装で GREEN にする。
5. cushion と確認後の遷移を実装し、確認した URL が別の遷移先にすり替わらないことを検証する。
6. package.json と CI の正式な検証を通し、未実行や環境エラーを成功として記録しない。
7. caller の切替と公開は別途実施し、通常の CI、deploy、安全な production verification の順に確認する。

## 内部 URL の acceptance criteria

- 許可された内部 URL は Away の cushion と確認手順で動作する。
- 不正な内部 URL は外部 URL と同様に拒否する。
- 内部 URL を渡しても Jump の承認や内部 RT は生成しない。
- 内部 origin 間の許可 edge を Away に複製しない。
- 内部 URL であることから安全性や trust を推論しない。

## 検証と対象外

最低限 `format:check`、`lint:check`、`typecheck`、`test:cov` を実行する。
生成 Worker 型の確認、worker runtime、E2E、knip、dependency audit、Cloudflare dry-run は既存 package.json と CI に従う。

Jump の runtime 変更、Rails issuer cleanup、署名方式の未検討な流用、実装開始の許可を理由にした本番公開は対象外とする。
[Jump の計画](../../umaxica-apps-edge-jump/plans/jump-internal-only.md) の production gate は維持する。
