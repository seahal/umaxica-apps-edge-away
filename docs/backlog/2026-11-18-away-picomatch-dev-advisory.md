# 開発依存 picomatch の ReDoS と CI への影響

2026-11-18 調査（`a462a4f`）。対応は判断待ち。

`pnpm audit --json` は `picomatch@4.0.7` に High 1件（CVE-2026-112366）を報告した。
特定の glob パターンを処理すると正規表現の照合に時間がかかる。調査時点のアドバイザリに修正版の記載はない。
[アドバイザリ GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)・[lockfile](../../pnpm-lock.yaml)

## 判断材料

依存元は Knip・Vitest 系で、現行のファイル探索パターンはリポジトリの設定にある。
本番依存は Hono のみで、Worker の HTTP 入力から該当処理に届く経路は見つからなかった。
一方、CI の `pnpm audit --audit-level=high` では今回の検出が失敗条件を満たす。
[Knip の対象](../../knip.json)・[Vitest の対象](../../vite.config.ts)・[CI の監査ジョブ](../../.github/workflows/integration.yaml)

対応を決める際は監査を再実行し、修正版の公開状況と依存元が解決するバージョンを確認する。
更新を選ぶ場合は、lockfile の解決結果、監査、Knip、単体テストを確認する。
