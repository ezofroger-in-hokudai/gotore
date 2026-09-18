# テスト運用: 管理者によるアカウント発行

2026-09-15以降のGoogle自己登録は[Google認証ガイド](google-signin.md)を優先する。以下の一般登録禁止設定はGoogle導入前・新規登録停止時に使う。管理者発行と既存メールログインの手順は継続する。

ユーザー合意により、テスト中は管理者がSupabase Authでアカウントを発行する。
アプリの自己登録は提供しない。画面だけの変更ではAuth APIからの登録を防げないため、以下のクラウド設定も必須。
既存のアカウント・グループ・記録は保持する。追加migrationは不要。

## 公開Supabaseの設定（管理者が行う）

1. VercelのSUPABASE_URLと同じプロジェクトをSupabase Dashboardで開く。
2. Authentication → Sign In / Providersで **Allow new users to sign up** をオフにして保存する。Emailプロバイダーのログインは有効のままにする。匿名ログインは無効のままにする。
3. Emailの **Confirm Email** は有効のままにする。確認メールを避けるために全ユーザーの確認を無効化するのではなく、以下でテスト対象者だけを確認済みとして発行する。
4. Authentication → URL Configurationの **Site URL** を `https://egotore.com/` に変更する。Redirect URLsにも同じ正確なURLを登録する。これはlocalhostへの遷移対策であり、メール送信の429制限とは別の設定。

この設定はリポジトリのmigrationやVercelへの再デプロイだけでは反映されない。

## テスト用アカウントの発行

1. Authentication → Usersで対象メールアドレスの既存ユーザーを確認する。すでに存在する場合は重複作成・削除せず、確認状態を調べる。
2. 新規の場合は **Add user → Create new user** を使う。メール送信を伴うInviteではない。
3. 本人から確認したメールアドレスと、ユーザーごとの十分に長いランダムなパスワードを設定し、**Auto Confirm User** をオンにして作成する。
4. Usersに表示され、メール確認済みになったことを確認する。資格情報は本人に個別の安全な経路で渡し、チャット・Issue・Git・スクリーンショットに残さない。テスト用に配布したパスワードを他サービスで使い回さない。
5. 公開画面でログインし、グループ作成・参加・記録共有・ログアウト・再ログインを確認する。

DBのTable EditorやSQLでauth.usersへ直接INSERTしない。public.gotore_profilesへ行を追加するだけでもログイン用アカウントは作成されない。

表示名はアプリの「設定」から変更でき、Authの **user_metadata.display_name** に1〜20文字（前後空白を除く）で保存する。管理者が設定する場合、Dashboardで編集できなければ信頼された管理環境のAuth Admin APIを使う。

#29の合意により、Auth側に名前がある場合はその名前を優先し、未設定・空白・文字列以外の場合は **public.gotore_profilesの既存名を保持する**。プロフィールも存在しない初回だけ「トレーニー」で作成する。意図してAuthに「トレーニー」と設定した場合は通常の名称変更として反映する。DBだけを編集してもAuthに名前がある場合はAuthの名前に戻るため、通常の変更にはアプリの設定画面を使う。

既に上書きされ失われた名前は、この修正では自動復元できない。本人が設定画面から再保存する。設定画面はAPIから保存済みの名前を読み込み、取得失敗時は既定名を表示せず再試行を案内する。

管理者APIで作成する場合の属性は `email`、`password`、`email_confirm: true`、`user_metadata: { display_name: "表示名" }`。既存ユーザーの変更には `updateUserById` を使う。管理キーは管理者の信頼された環境だけで扱い、アプリのブラウザ・NEXT_PUBLIC_変数へ置かない。この変更でVercelに管理キーを追加する必要はない。

## ローカル開発・CI

- `supabase/config.toml` はGoogle自己登録用のhookを有効にする。メール自己登録は拒否し、メール確認は維持する。既存環境は `make db-migrate` で関数を追加してから `make db-stop` → `make db-start` で反映する。通常のstopはデータを保持する。`--no-backup` や `make db-reset` は使わない。
- ローカルアカウントもStudio（http://localhost:59323）のAuthenticationから確認済みで作成する。メール送信は不要。
- `make test-e2e` はローカルCLIのstatusから取得した管理キーをテストプロセス内だけで使い、管理者APIでランダムなメールアドレスのテストユーザーを作成する。キーを環境ファイル・ブラウザ・ログへ書かない。
- E2Eの管理者操作はE-GOTORE専用のloopback:59321に限定し、クラウドのAuthには実行しない。テスト用アカウントと共有記録はローカルDBに残る。
- メール自己登録APIの拒否、Googleの認証復帰と初回表示名、ログイン失敗の案内、管理者作成の2ユーザーによる共有と再ログインを検証する。

## 残る制約・自己登録を再開するとき

管理者発行は少人数のテスト運用や既存利用者向けに維持する。Google自己登録は追加するが、メール自己登録・パスワード再設定・管理画面は提供しない。資格情報の再発行は管理者対応とする。表示名はアプリの設定画面から変更できる。
メール自己登録の再開時は#25/#4でSMTP、送信制限、正しい公開URL、メール確認、登録画面、テストと運用をまとめて見直す。管理者用の確認済み発行を一般登録APIへ公開しない。

## 参照

- [Supabase Authの登録許可設定](https://supabase.com/docs/guides/auth/general-configuration)
- [管理者によるユーザー作成](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [管理者によるユーザー更新](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)
- [Authの戻り先URL](https://supabase.com/docs/guides/auth/redirect-urls)
