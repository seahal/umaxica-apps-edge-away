# ADR 0001: Away の独立した外部遷移の責務

Status: proposed (2026-10-04).
本体の実装開始を許可する範囲と責務の境界を記録する。
方式の選択、実装完了、デプロイ済みであることは示さない。

## Jump 側の移管準備

Jump 側で external destination capability の撤去準備を開始した。
Jump は schema 1 と必須の `dst` を維持し、登録済み内部 origin 間の遷移だけを扱う方針である。
現時点では文書と未実行の契約テストを準備しており、runtime の撤去や本番検証は完了していない。

移管するのは外部 URL の検証と cushion による確認の責務である。
Jump のコード、鍵、JWKS、registry をそのまま移植することは意味しない。
Jump 側の段階的撤去と Away 側の独立実装は別々に進める。

## Away の責務

Away は `away.umaxica.net` で外部リンクの open redirect 防止と遷移前の確認を担当する。
この範囲の URL validation、拒否契約、cushion 本体の実装を開始してよい。
呼び出し元は Away を直接選択し、Jump の承認や RT の交換を経由しない。

```text
internal navigation → Jump → internal destination
external navigation → Away → cushion → external destination
```

Jump から Away への redirect、forwarding、fallback、compatibility bridge は作らない。
Away の入力保護に署名を採用する場合も、Jump の鍵と JWKS は再利用しない。

## 内部 URL が渡された場合

Away は内部リンクの確認にも利用できる仕様とする。
内部 URL にも Away 自身の URL validation と cushion の確認を適用する。
これは現行 scaffold が内部リンクを処理できるという実測結果ではない。

ただし、Away に Jump と同じ内部遷移機構は追加しない。
issuer registry、issuer ごとの内部 origin graph、trust broker、内部遷移用 RT の発行と検証は Jump の責務に残す。
内部 URL であることを理由に検証を省いたり、Jump の承認済み遷移として扱ったりしない。
Away の URL validation と open redirect 防止は維持する。

## 実装開始とリリースの区別

Away の実装開始は、Jump 側の撤去完了を待つ条件にしない。
ただし、既存 caller の切替と本番公開には、それぞれの検証と通常のリリース手順が必要である。
入力保護、確認操作、URL の拒否条件は Away の契約として明文化してから実装する。
本 ADR の更新だけで caller の切替、commit、push、deploy は行わない。

## 関連文書

- [Away の実装計画](../plans/away-external-navigation.md)
- [Jump ADR 0007](../../umaxica-apps-edge-jump/adr/0007-remove-external-destinations.md)
- [Jump の実装計画](../../umaxica-apps-edge-jump/plans/jump-internal-only.md)
