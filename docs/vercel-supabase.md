# Vercel Services・Supabaseへの公開準備

ユーザー指定により、Next.jsとFastAPIをVercel Services（Beta）の1プロジェクトへまとめる。今回は設定の追加とローカル検証までとし、クラウドへの変更は行わない。

## 構成と境界

- リポジトリルートの `vercel.json` に `frontend` と `backend` のサービスを定義する。
- `/api/*` はbackendへ、それ以外はfrontendへ送る。APIのパスは変更せず、FastAPIの `app.main:app` を起動する。
- Vercel上ではNext.jsによるAPI転送を行わない。通常の `make frontend` と `make backend` では従来どおりNext.jsがローカルAPIへ転送する。
- Supabase Authによる本人確認、FastAPIのメンバー権限、RLSによるDB直接アクセス拒否を維持する。
- サーバーレスのDB接続はSupabaseのTransaction Poolerを使い、Psycopgの自動prepared statementを無効にする。公開DBへの接続にはSSLを使う。
- 認証キーの変数名は既存の `SUPABASE_ANON_KEY` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を維持する。秘密のDB接続文字列を `NEXT_PUBLIC_` 変数へ入れない。

## Vercelの設定

1. 変更をレビューしてGitHubへ共有後、そのリポジトリをVercelへImportする。
2. Root Directoryはリポジトリルート（`.`）にする。`frontend` や `backend` にはしない。
3. プロジェクト全体へNext.js／FastAPI用のBuild CommandやOutput Directoryを上書きしない。サービスごとのFramework・起動先・buildは `vercel.json` で指定済み。
4. 次項の環境変数を同じVercelプロジェクトに設定する。System Environment Variablesへのアクセスを有効にする（Next.jsの転送切替で `VERCEL=1` を利用）。
5. Supabaseの準備後にデプロイし、下の公開時チェックを実施する。

以前の「WebとAPIを別々のVercelプロジェクトにする」という案は、この方式では採用しない。
`BACKEND_INTERNAL_URL` はVercel上では不要で、設定済みでも転送には使わない。通常のローカル・Compose・E2Eでだけ使用する。
認証キーの変数名変更、Turborepo導入、API実装のTypeScriptへの移植は行わない。

## 環境変数

値の一覧はルートの [.env.vercel.example](../.env.vercel.example)。このファイルはサンプルであり、自動で本番設定を読み込むものではない。

| 変数名 | 値・用途 |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | SupabaseのProject URL。ブラウザ用 |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | SupabaseのPublishable Keyまたはanonキー。ブラウザ用 |
| SUPABASE_URL | 同じProject URL。APIの本人確認用 |
| SUPABASE_ANON_KEY | 同じ公開キー。APIの本人確認用 |
| DATABASE_URL | SupabaseのTransaction Poolerの接続文字列。パスワードを含むサーバー用の秘密値 |
| DATABASE_POOL_MAX_SIZE | 任意。既定4、0〜10。プロセスごとのDB接続上限。0でアプリ側の再利用を無効化 |
| APP_ENV | production |

Supabaseが案内する `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` という名前をそのまま登録しても、現在のコードは読み取らない。その値を `NEXT_PUBLIC_SUPABASE_ANON_KEY` に設定する。
秘密キー（Secret Key／service_role）やDBパスワードを `NEXT_PUBLIC_` 変数へ入れない。今回service_roleは使用しない。
値はVercelの環境変数画面で設定し、チャット・Git・ビルドログに貼らない。公開用とPreview用は対象環境を分け、Previewを実データのある本番DBへ無条件につながない。
環境変数の変更は既存デプロイに反映されないため、サーバー用の変数も含めて変更後は対象環境へ再デプロイする。ローカルの `.env` と `.env.local` は上書きしない。

### 設定エラーの切り分け（#24）

- `NEXT_PUBLIC_` 変数は公開用なのでConfig（`visibility: config`）を選ぶ。Secretでは登録できない。`DATABASE_URL` はSecretとし、公開prefixを付けない。サーバー用のURL・公開キーも秘密キーではないためConfigでよい。
- Vercelへ値を貼る際は、値だけを入力する。変数名・説明文・引用符・改行・前後空白・全角文字を含めない。URLは `http://` または `https://` で始まるProject URL（本番はHTTPS）、キーは同じプロジェクトのPublishable／anonの実値を使う。
- Production／Previewの対象と、現在開いているデプロイを確認する。修正した環境へ再デプロイし、古いデプロイURLで確認しない。
- APIは認証リクエスト時にURLとキーの形式を検証する。不正な場合は接続せず503となり、ログには `SUPABASE_URL` または `SUPABASE_ANON_KEY` の変数名だけを記録する。値・Bearerトークン・例外の生データは出さない。設定値を勝手に補正しない。
- `/api/health` の200はプロセスの生存確認であり、認証・DB接続の成功を保証しない。未認証は401のまま。正しい形式でも間違ったプロジェクトのキーなどは外部認証の応答で失敗するため、形式検証だけで設定の正当性が確定するわけではない。
- 診断のためにキー・パスワード・DB接続文字列をIssueやログへ貼らない。503の安全なメッセージと変数名、対象環境、再デプロイ済みかを共有する。

Config／Secretと反映タイミングは [Vercel環境変数](https://vercel.com/docs/environment-variables) を参照（2026-09-07確認）。

## Supabaseの準備

- テスト中は [管理者登録ガイド](admin-managed-accounts.md) に従い、一般登録を禁止して確認済みアカウントを発行する。公開プロジェクトの設定は管理者が行う。
- 公開用のSupabaseプロジェクトを用意する。ローカルDBのテストアカウントや記録は自動移行しない。
- 対象プロジェクトと既存テーブルを確認したうえで、リポジトリのmigrationを適用する。既存データを消す `db reset` は本番へ実行しない。今回はリモートDB操作を行っていない。具体的な履歴確認・dry-run・適用は [共有DBへの適用手順](../supabase/README.md#共有dbへの適用担当者向け) を参照する。Vercelのbuildや現在のCIはクラウドDBへのmigrationを自動適用しない。
- Connect画面でTransaction Poolerの接続先を取得し、`DATABASE_URL` に設定する。例のホスト名をそのまま使わない。パスワードの特殊文字はURLエンコードし、`sslmode=require` を指定する。
- APIは直接SQL接続で認可を実施する。ローカル同様、migrationのテーブルを操作でき、RLSで一律拒否されない信頼済みサーバー用DBロールで接続する。ブラウザへ接続文字列を渡さない。
- AuthのSite URLと許可するRedirect URLを公開URLに合わせる。登録確認メールを使う場合は送信元・SMTPも設定する。
- Supabaseの認証・DB設定、Vercelの環境変数は本番とPreviewの境界をレビューする。

## 検証と公開時チェック

ローカルでは `make check` と `make test-e2e`。DB統合テストにはREADMEの `TEST_DATABASE_URL` を使う。
`make test-e2e` は同じfrontendディレクトリに別のNext.js開発サーバーが動いていると起動ロックで失敗するため、通常の `make frontend` を終了してから実行する。DBとAPIのデータは削除しない。
Services設定のテストは `frontend/tests/unit/deployment.test.mjs` にあり、`make check` と既存CIのfrontendテストに含まれる。
Vercel向けのNext.js buildのみを確認する場合は `cd frontend && VERCEL=1 bun run build` とする。これだけではServices全体のデプロイ確認にはならない。

公開後に確認すること:

- `/` がGO TORE、`/manifest.webmanifest` とアイコンが正しく配信される。
- `/api/health` がAPIのJSONを返す。未認証の `/api/groups` は401になる。
- 管理者が発行した2ユーザーでログイン・グループ作成／参加・記録共有・再ログインができる。共有外のユーザーには見えない。一般登録はAuth API側でも拒否される。
- 通信失敗時に入力を保持し、保存の再送で重複しない。
- iPhone／Androidでホーム画面に追加・再起動して操作できる。

FastAPIの `/docs`・`/redoc`・`/openapi.json` は今回の公開経路に含めない。必要な仕様確認はローカルの8000番で行う。
この構成はBeta機能に依存する。クラウドのbuild・経路・実DB接続は、実デプロイでの受け入れ確認が必要。
今回、単体・DB統合テスト、通常／VERCEL=1のbuild、通常のlocalhost開発画面と本番ビルドにローカルで同じ経路を与えた構成のE2Eを確認した。Vercelサービス自体の実行検証ではない。詳細は [progress.md](../progress.md) を参照。

## 参照

- [Vercel Services](https://vercel.com/docs/services)
- [Services設定](https://vercel.com/docs/services/config-reference)
- [Servicesの経路](https://vercel.com/docs/services/routing)
- [Supabase接続](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Prepared statementの無効化](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL)
- [Vercelのシステム環境変数](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Supabase Authの戻り先URL](https://supabase.com/docs/guides/auth/redirect-urls)
- [SupabaseのSMTP設定](https://supabase.com/docs/guides/auth/auth-smtp)
