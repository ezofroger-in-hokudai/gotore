# 開発・テスト用の管理者登録

2026-09-14のユーザー承認で[メール確認付きの一般登録](email-signup.md)を追加した。本書は開発・テスト用アカウントの手動発行を扱う。以前の管理者発行専用・一般登録禁止の運用は、新しい登録仕様で置き換える。既存のアカウント・グループ・記録は保持し、追加migrationは不要。

## 公開Supabaseの設定（管理者が行う）

SMTP・Site URL・Redirect URLs・Confirm Email・登録許可は[一般登録の公開手順](email-signup.md#公開への反映手順)を参照。設定はリポジトリのmigrationやWebの再デプロイだけでは反映されない。

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

- `supabase/config.toml` では一般登録とメール確認を有効にする。すでに起動中なら `make db-stop` → `make db-start` で反映する。通常のstopはデータを保持する。`--no-backup` や `make db-reset` は使わない。
- ローカルアカウントもStudio（http://localhost:59323）のAuthenticationから確認済みで作成する。メール送信は不要。
- `make test-e2e` はローカルCLIのstatusから取得した管理キーをテストプロセス内だけで使い、管理者APIでランダムなメールアドレスのテストユーザーを作成する。キーを環境ファイル・ブラウザ・ログへ書かない。
- E2Eの管理者操作はGO TORE専用のloopback:59321に限定し、クラウドのAuthには実行しない。テスト用アカウントと共有記録はローカルDBに残る。
- 新規登録・実Mailpitの確認リンク・未確認ログイン拒否・再送と、管理者作成の2ユーザーによる共有と再ログインを検証する。

## 残る制約

今回追加するのは新規登録時のメール確認。メールアドレス変更・パスワード再設定・MFA・アプリ内の管理者画面は提供しない。資格情報の再発行は引き続き管理者対応。管理キーを一般ユーザー向けAPIへ公開しない。

## 参照

- [Supabase Authの登録許可設定](https://supabase.com/docs/guides/auth/general-configuration)
- [管理者によるユーザー作成](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [管理者によるユーザー更新](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)
- [Authの戻り先URL](https://supabase.com/docs/guides/auth/redirect-urls)
