# メール確認付きの新規登録

2026-09-14のユーザー承認に基づき、管理者発行専用の運用からメール確認付きの一般登録へ変更する。#25の自己登録再開に対応し、週次#149の記録改善より先に実施する。既存アカウント・グループ・記録を保持し、DB migrationは追加しない。

## 登録と確認

- ログイン画面から新規登録へ進み、表示名・メールアドレス・パスワードを入力する。
- 表示名は前後空白を除いて1〜20文字。メールは前後空白を除く。新規パスワードは8文字以上で、既存ユーザーのログインには新しい最小長を適用しない。
- Supabase AuthのsignUpにdisplay_nameと現在のWeb originの/auth/confirmを渡す。一般登録とEmailを有効、Confirm Emailを有効、匿名登録は無効にする。
- 登録要求成功は確認完了を意味しない。確認待ち画面でアドレスと再送を表示し、パスワードを破棄する。フォーム内容・確認トークンを独自の端末保存やログへ書かない。
- Supabaseの確認リンクを開くと/auth/confirmへ戻る。既存のブラウザ用Authクライアントのimplicitフローを使い、成功したセッションと確認済みメールを検証して利用開始へ案内する。別ブラウザで確認した場合も元の画面からメール/パスワードでログインできる。
- リンクなし・期限切れ・使用済み・認証通信失敗は確認完了と表示せず、再送とログインへ案内する。URLの認証情報・内部エラーを画面に出さない。
- ログイン時にemail_not_confirmedなら確認待ちへ案内。再送画面はログイン画面と期限切れ画面からも開ける。再送はtype=signupを使用する。
- 再送の成功または送信制限後は画面で60秒待機。実際の濫用防止はAuth側の送信間隔・レート制限で行う。存在しない/確認済みメールへの再送でも登録状態を断定せず、同じ一般的な案内を返す。
- 登録済みアドレスへの再登録で既存データを上書きしない。正常応答でもメール配送を保証せず、ログインへの入口を表示する。

## ローカルと公開環境

ローカルはMailpitに確認メールを捕捉し、外部メールを送信しない。既存Supabaseの設定反映はmake db-stop → make db-start（データ保持）を使い、db-resetは行わない。戻り先に開発のlocalhost/127.0.0.1:3000とE2Eの127.0.0.1:3100の/auth/confirmを登録する。

公開にはカスタムSMTP・送信元とドメイン認証、正確なSite URL/Redirect URLsが必要。Supabase既定SMTPは一般の宛先への配送を制限するため一般公開には使わない。SMTPの資格情報はSupabaseに設定し、Web/APIの環境変数やリポジトリへ置かない。契約・DNS・公開Auth設定の反映は対象環境と準備状況を確認して実施する。準備前に公開の登録だけ有効にしない。

## 公開への反映手順

1. Webと同じSupabaseプロジェクトを確認し、現在の登録許可・確認設定・Site URL・Redirect URLs・SMTP設定を管理者の手元に控える。秘密値をIssueへ貼らない。
2. 利用する送信サービスで送信元アドレスとドメインを認証し、サービス指定のDNS（SPF/DKIM等）を反映する。リンク追跡は確認URLを書き換えるため無効にする。
3. SupabaseのAuthentication → Email → SMTP SettingsでCustom SMTPを設定する。必要な値はhost、port、user、password、送信元メール、送信者名「GO TORE」。これらをアプリの.envへ追加する必要はない。
4. URL ConfigurationのSite URLを `https://egotore.com/` に設定し、Redirect URLsに `https://egotore.com/auth/confirm` を正確に追加する。ProductionにPreview用ワイルドカードを追加せず、Previewを試す場合は専用Authと正確なPreview URLを使用する。
5. 確認メール（Confirm signup）の件名と本文を [supabase/templates/confirmation.html](../supabase/templates/confirmation.html) に合わせる。リンクはSupabaseの `{{ .ConfirmationURL }}` を使う。Authが検証後に許可された/auth/confirmへ戻す。
6. EmailプロバイダーとConfirm Emailを有効、匿名ログインを無効、最小パスワード長を8文字にする。確認期限は1時間、同一宛先の再送間隔は60秒を基本とする。プロジェクト全体の送信上限はSMTP契約と想定利用数に合わせ、ローカル用100通/時をそのままコピーしない。
7. アプリの変更を公開し、既存ユーザーのログインを確認する。SMTP・テンプレート・戻り先を準備できたら「Allow new users to sign up」を有効にする。
8. 許可されたテスト用の実アドレスで登録し、配送、未確認ログイン拒否、リンク確認、プロフィール名、新規ユーザーの記録/共有を確認する。再送・使用済みリンクと、スマホ/PWAで別ブラウザから確認後に戻ってログインする操作も確認する。

公開準備が完了するまでは登録許可を無効のままにする。準備中の登録要求は案内を返し、既存ログインは維持する。公開後に配送障害が起きた場合は一般登録を一時停止して原因を調べ、Confirm Emailを無効にして回避しない。既存アカウントや未確認ユーザーを一括削除しない。

## 検証

登録前の境界値、要求重複、送信失敗/429、登録済み、未確認ログイン、再送、無効リンク、実Mailpitのリンクを別ブラウザで開いて確認後にログイン、本人プロフィールの反映と記録共有を確認する。make checkとmake test-e2e、320/390/430pxの画面を検証する。公開SMTPの実配送・実機PWAはローカル成功と区別する。

## 参照

- [Supabaseのメール・パスワード認証](https://supabase.com/docs/guides/auth/passwords)
- [確認メール再送](https://supabase.com/docs/reference/javascript/auth-resend)
- [SMTP設定](https://supabase.com/docs/guides/auth/auth-smtp)
- [確認メールのテンプレート](https://supabase.com/docs/guides/auth/auth-email-templates)

公式資料確認日: 2026-09-14。
