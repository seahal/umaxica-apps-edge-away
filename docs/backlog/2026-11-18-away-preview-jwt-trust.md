# Preview 環境で本番の Away JWT を受理するか

2026-11-18 調査（`a462a4f`）。対応は判断待ち。

Worker は起動時に `createApp()` を引数なしで呼ぶ。JWT の `aud` は
`https://away.umaxica.net` と完全一致する必要があり、issuer と JWKS の取得先も固定される。
preview 用にはレート制限のカウンタが分かれている。別ホストで同じビルドを公開した場合、
そこでも本番向けの有効な JWT で遷移先の確認画面を表示できる。
対象は外部リンクの表示で、アカウント操作を行う機能はない。
[Worker 入口](../../src/cloudflare.ts)・[audience の設定](../../src/index.ts)・[issuer 一覧](../../src/config/issuers.ts)

## 判断材料

`workers_dev` は無効で、`preview_urls` の指定はない。Cloudflare は既存の
Version URL 設定をこの場合に保持するため、設定ファイルだけでは公開状況を確定できない。
調査ではアカウント上の Version URL、preview の経路、アクセス制御は未確認。
[Wrangler 設定](../../wrangler.jsonc)・[Cloudflare の Version URL 仕様](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/)

公開経路を確認したうえで、preview を使うか、使う場合はどの環境のトークンを受理するかを決める。
環境分離を選ぶ場合の確認点は、各環境で自環境向けのテストトークンが通り、他環境向けが拒否されること。
