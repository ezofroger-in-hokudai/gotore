# Googleで登録・ログイン

## 採用範囲

2026-09-15のユーザー指定により、新規登録をGoogleログインで開始する。管理者発行のみの初版仕様をこの範囲で更新する。メール登録PR #154は未マージの別案であり、取り込まない。実装Issueは[#156](https://github.com/ezofroger-in-hokudai/gotore/issues/156)、関連は#25、週次#149。実装補助はCodex、レビュー担当は未定。

- 外部向け（External）・本番公開（In production）で、openid/email/profileだけを利用する。Google APIの機密/制限付き権限、オフラインアクセス、Gmail/Drive/Calendar権限は要求しない。
- 上記基本権限では権限審査を前提にしない。ブランド未確認では同意画面のアプリ名/ロゴ表示に制約がある。学校/会社のアカウントは管理者がブロックできるため、全アカウントの利用を保証しない。
- 設定完了後にNEXT_PUBLIC_GOOGLE_AUTH_ENABLED=trueでGoogleボタンを表示する。未設定の公開環境を壊さないため既定は非表示。
- Supabaseの既存ブラウザ認証（implicit）を使い、戻り先は現在のoriginの/auth/callbackに固定する。外部のnextパラメーターを受け付けない。トークン/プロバイダーのエラー詳細を画面・ログへ出さず、復帰時はURLから除く。
- 既存のメール・パスワードログインを維持する。Googleの新規登録を許可するため全体のsignupを有効にし、Before User Created hookでGoogle以外の自己登録を拒否する。メールプロバイダーはログイン用に有効のままにし、Confirm Emailも維持する。匿名/SMS登録は無効。
- 新規Google利用者には共有用の表示名（前後空白除去、1〜20文字）を設定してもらう。Googleの氏名/写真を自動で共有プロフィールに転記しない。表示名が設定済みのユーザーには通常画面を開く。Authに表示名がない既存利用者にはDB保存名を初期値として保持する。
- 表示名保存は既存のAuth metadata更新とプロフィール同期を使う。初回設定を終えるまで通常の記録/共有UIを開かない。APIの認可と既存プロフィール同期規則は維持する。
- 同じ確認済みメールの関連付けはSupabase標準に任せる。アプリ独自のメール一致による統合・別メールのアカウント統合・既存データ移動は行わない。既存ユーザーは同じメールのGoogleアカウントを利用し、異なる場合は従来ログインを使う。

## 公式根拠

- [Googleの公開状態と審査の条件](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- [SupabaseのGoogleログイン](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [アカウントの関連付け](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [登録前hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)、[無料プランでの対応と権限](https://supabase.com/docs/guides/auth/auth-hooks)

## egotore.comへの設定手順

公開環境への操作はこのPRだけでは実行されない。SMTP/Resendの契約・DNSのメール用レコード・Googleの機密権限申請は、この方式には不要。アプリ名/ロゴを審査済みとして表示したい場合は、別途ブランド確認を行う。

### 1. Google CloudでWeb用のログインを登録する

1. [Google Cloud Console](https://console.cloud.google.com/)を開く。上部のプロジェクト選択からE-GOTORE用のプロジェクトを選ぶか「新しいプロジェクト」で作成する。AndroidアプリやGoogle Playへの登録は不要。
2. [Google Auth Platform](https://console.cloud.google.com/auth/overview)を開き、「開始」が出たらアプリ名をE-GOTORE、サポートメールと連絡先を管理者が受け取れるアドレスにする。
3. 「対象（Audience）」を **外部（External）** にする。「内部（Internal）」は組織内限定なので使わない。
4. 「データアクセス（Data Access）」のスコープは **openid / …/auth/userinfo.email / …/auth/userinfo.profile** の3つだけにする。Gmail、Drive、Calendarなどは追加しない。
5. 「ブランディング（Branding）」のホームページは `https://egotore.com/`、承認済みドメインは `egotore.com`。プライバシーポリシー等を入力する場合は実在して内容が正しい公開ページを使い、架空のURLを入れない。今回はカスタムロゴを追加しない。Googleから追加確認を要求された場合は要求内容を確認し、未確認のブランドを審査済みと扱わない。
6. 「クライアント（Clients）」→「クライアントを作成」。種類は **ウェブ アプリケーション**。
7. 「承認済みのJavaScript生成元」に `https://egotore.com` を追加する。
8. 次項のSupabaseのGoogle設定画面に表示される **Callback URL**（通常 `https://PROJECT_REF.supabase.co/auth/v1/callback`）を、「承認済みのリダイレクトURI」にそのまま追加する。ここは **egotore.com/auth/callbackではない**。
9. 作成したClient IDとClient SecretをSupabase設定用に保管する。Secretはチャット・Git・スクリーンショット・NEXT_PUBLIC_環境変数へ置かない。
10. 「対象（Audience）」で **アプリを公開（Publish app）** を選び、**本番環境（In production）** にする。公開操作とブランド/機密権限の審査申請は別。テストユーザー一覧に依存した運用はしない。

### 2. Supabaseで新規登録の範囲を設定する

[Supabase Dashboard](https://supabase.com/dashboard)で、VercelのSUPABASE_URLと同じプロジェクトを開く。

1. まず **Allow new users to sign upはオフのまま** にする。
2. migration `20260915010000_google_signup_policy.sql` を既存のmigration手順で追加適用する。データのリセットは不要。関数を追加するだけで既存のユーザー/記録を移動しない。
3. **Authentication → Hooks → Before User Created** でPostgres functionを選び、`public.gotore_before_user_created` を登録・有効化する。Google以外の自己登録を拒否する関数。無料プランで利用できる。
4. **Authentication → Sign In / Providers → Google** を開く（この画面のCallback URLをGoogle側に登録）。Googleを有効にしてClient ID/Client Secretを設定する。メールなしの許可とnonce検証のスキップはオフのまま。
5. **Authentication → URL Configuration** のSite URLを `https://egotore.com/` にする。Redirect URLsへ `https://egotore.com/auth/callback` を追加する。Previewは本番と別のAuth/DBを使い、実際にテストする正確な戻り先だけを登録する。
6. **Emailプロバイダーは有効、Confirm Emailはオン** のままにする。既存メール・パスワードのログインを維持するため。Anonymous/SMS登録はオフ。
7. hookが有効なことを確認した後で、全体の **Allow new users to sign upをオン** にする。これをオフのままにするとGoogleの新規ユーザーも登録できない。逆にhookなしでオンにするとメール自己登録も開くので、この順番を守る。

管理者のCreate userは既存の発行手順で引き続き利用できる。hookは自己登録を制限し、既存ユーザーのログインは止めない。アプリ独自の管理キーや追加の有料メールサービスは不要。

### 3. VercelでGoogleボタンを表示する

1. [Vercel Dashboard](https://vercel.com/dashboard) → E-GOTOREのプロジェクト → **Settings → Environment Variables**。
2. Productionに `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` をConfigとして設定する（公開してよい切替値）。GoogleのClient SecretはVercelへ設定せずSupabase側だけで扱う。
3. 本PRがmainに統合されたコードを再デプロイする。NEXT_PUBLIC_値はビルド時に取り込まれるため、環境変数を保存しただけではボタンは変わらない。
4. `https://egotore.com/` を開き、「Googleで続ける」が表示されることを確認する。

### 4. 公開前に実際のアカウントで確認する

- テストユーザーに登録していない個人のGoogleアカウントで登録 → ニックネーム入力 → グループ参加 → 記録 → ログアウト/再ログインを試す。
- 同意画面の要求が基本情報だけであることを確認する。ブランド未確認ではSupabaseのプロジェクトドメイン等が表示される場合がある。
- 既存の確認済みメールと同じGoogleアカウントでは、Supabase UsersのユーザーIDと既存のグループ/記録/表示名が維持されることを確認する。別メールは別ユーザーになるため、既存ユーザーを削除したりデータを手動で移動したりしない。
- 従来のメール・パスワードでもログインできることを確認する。
- Google画面でキャンセルして戻れること、/auth/callbackから正常時は/へ移動してURLに認証情報が残らないことを確認する。
- メールの自己登録がhookの403で拒否されることを、管理者が管理するテスト用アドレスで確認する。外部の他人のアドレスは使わない。
- 学校/会社アカウントでのみブロックされる場合は組織管理者の制限を確認する。「内部」設定・余分なスコープ・テスト公開と混同しない。

Googleのプロジェクト設定と公開での実ログインは、ローカルのモックE2E成功だけでは確認済みとしない。

## ローカル開発・CI

通常は `make db-migrate` で関数を追加適用してから `make db-stop` → `make db-start` でAuthの設定を反映する。stop/startはデータを保持する。初回起動/CIではmigrationが自動適用される。Googleの秘密情報がなくても、管理者発行のメールログインとモックE2Eを実行できる。

Googleへ実際に接続するローカル環境だけ、config.tomlへ次を追加して再起動する。秘密値はGit対象外のリポジトリルート`.env`の `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` に保存する。

```toml
[auth.external.google]
enabled = true
client_id = "YOUR_WEB_CLIENT_ID"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
skip_nonce_check = false
```

Google側にはローカルの生成元 `http://127.0.0.1:3000` とSupabaseの戻り先 `http://127.0.0.1:59321/auth/v1/callback` を開発用クライアントに登録する。アプリ側は `frontend/.env.local` に `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` を追加してNext.jsを再起動する。CIのPlaywrightはこのフラグをテストサーバーにだけ渡し、外部Googleへの通信をモックする。

検証は `make check`（専用TEST_DATABASE_URL）と `make test-e2e`。DBテストはGoogle許可/メールと他プロバイダー拒否/ユーザーmetadata偽装拒否/Auth専用実行権限、ブラウザは復帰/キャンセル/初回名/失敗再試行/既存ログインと記録共有を確認する。Googleへの実ログイン・アカウントの自動関連付け・実機PWAは公開前に上記手順で確認する。

## 停止・後続

停止時は全体のAllow new users to sign upをオフにすれば、新規Google登録を止めても既存ユーザーのログインは継続できる。Googleプロバイダーを無効にすると既存Googleユーザーもログインできなくなるため、単に新規登録を止める目的では無効にしない。

メール登録/パスワード再設定は#25/#4、別メール間の明示的な連携は#4、実機PWAは#23の後続とする。メール確認PR #154をそのまま統合すると登録制限とUI方針が競合するため、再採用時にGoogle方式との整合を取り直す。

ボタンのGマークは[Google公式配信SVG](https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg)を利用し、[ボタンのガイドライン](https://developers.google.com/identity/branding-guidelines)を参照する。
