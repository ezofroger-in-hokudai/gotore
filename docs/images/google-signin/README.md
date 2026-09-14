# Googleログインの画面確認

Playwrightのgoogle-signin.spec.tsをローカルNext.js開発サーバーで実行。ログインは320/390/430px、初回表示名は390px。認証結果はモックであり、Google同意画面の実接続を示す画像ではない。

- [320px](google-login-320.png)
- [390px](google-login-390.png)
- [430px](google-login-430.png)
- [初回表示名の入力検証・再入力](google-nickname.png)

ボタンのGマークはGoogle公式素材。要求はopenid/email/profileのみ。利用者のGoogle氏名・写真を共有名に転記しない。
