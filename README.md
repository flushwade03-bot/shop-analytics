# shop-analytics

Etsy Open API v3 を使い、自分のショップの売上・リスティングと、他ショップの公開情報を取得するローカルAPIです。

## 必要環境

- Node.js 20以上
- 承認済みのEtsy APIアプリ

外部npmパッケージは使用していません。

## 初期設定

1. `.env.example` を参考に、Git管理外の `.env` を編集します。
2. Etsy Developer Portalのアプリ設定にも、Callback URLとして `https://flushwade03-bot.github.io/shop-analytics/oauth-callback.html` を登録します。
3. `npm start` を実行します。
4. ブラウザで `http://localhost:3000/auth/etsy` を開き、自分のEtsyアカウントで許可します。
5. 認証状態は `http://localhost:3000/auth/status` で確認できます。

最初に必要なのは `ETSY_API_KEY`、`ETSY_SHARED_SECRET`、`ETSY_REDIRECT_URI` の3項目です。`ETSY_SHOP_ID` は通常空欄のままでよく、OAuth認証後に自動取得します。

要求する権限は `transactions_r listings_r listings_w` のみです。アクセストークンとリフレッシュトークンは `.data/etsy-oauth.json` に自動保存され、このディレクトリはGitから除外されています。

## ローカルAPI

### 自分のショップ（OAuth必須）

- `GET /api/me/shop` — 認証した自分のショップ情報
- `GET /api/me/sales?limit=25&offset=0` — 売上レシート
- `GET /api/me/listings?state=active` — 自分のリスティング（draft等も指定可能）
- `POST /api/me/listings` — リスティングを作成
- `PATCH /api/me/listings/{listing_id}` — リスティングを編集

作成・編集はJSONを受け取り、Etsyへフォーム形式で送信します。必須項目は商品タイプなどによって異なるため、Etsyの `createDraftListing` / `updateListing` リファレンスに従ってください。安全のため、このAPIはリスティング削除機能を実装していません。

### 他ショップ・マーケット（公開情報のみ）

- `GET /api/public/shops/{shop_id}` — 公開ショップ情報
- `GET /api/public/shops/{shop_id}/listings?limit=25&offset=0` — 公開中リスティング
- `GET /api/public/listings/search?keywords=keyword&limit=25` — 公開リスティング検索

これらの公開ルートはOAuthトークンを送信せず、APIキー認証だけを使用します。他ショップの売上、下書き、購入者情報などの非公開情報にはアクセスしません。

## 秘密情報

次のファイル・ディレクトリはGitに含めないでください（`.gitignore` 設定済み）。

- `.env`
- `.env.local` などの `.env.*`（`.env.example` を除く）
- `.data/`

秘密値をターミナル出力、スクリーンショット、Issue、コミットへ貼り付けないでください。誤って公開した場合は、Etsy Developer Portalでsecretを直ちに再発行し、OAuthを再認証してください。

## Codexクラウドで使う

Codexクラウド環境には、次の値を暗号化されたSecretsとして登録します。

- `ETSY_API_KEY`
- `ETSY_SHARED_SECRET`
- `ETSY_REFRESH_TOKEN`
- `ETSY_ACCESS_TOKEN`（任意。未設定でもrefresh tokenから取得可能）
- `ETSY_SHOP_ID`（任意）

環境変数には秘密ではない次の値を登録します。

- `ETSY_REDIRECT_URI=https://flushwade03-bot.github.io/shop-analytics/oauth-callback.html`
- `ETSY_TOKEN_SCOPE=transactions_r listings_r listings_w`

Setup scriptには次を指定します。

```bash
bash scripts/codex-setup.sh
```

エージェントのインターネットアクセスを有効にし、許可ドメインへ `api.etsy.com` を追加します。売上取得とトークン更新には `GET` と `POST`、リスティング編集には `PATCH` が必要です。

クラウドタスクでは、たとえば次のCLIを利用します。

```bash
npm run etsy -- sales-summary
npm run etsy -- my-shop
npm run etsy -- my-listings --state=active --limit=100
npm run etsy -- public-shop 12345678
npm run etsy -- public-listings 12345678 --limit=100
npm run etsy -- search --keywords=wallet --limit=100
```

作成・編集コマンドはEtsy上のデータを変更するため、`AGENTS.md` によりユーザーの明示的な依頼と内容確認を必須にしています。

GitHub Pagesの `oauth-callback.html` は、Etsyから返されたOAuthパラメーターをローカルの `http://localhost:3000/auth/etsy/callback` へ転送します。OAuth認証時はローカルAPIを起動したままにしてください。
