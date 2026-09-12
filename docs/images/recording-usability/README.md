# 記録画面の操作改善

ローカルChromium、テスト専用ユーザー・架空の実績で撮影。実機や本番ユーザーの画像ではありません。

- [記録済み種目への切り替え](recorded-exercises.png)（#66）
- [320pxの記録入力](recording-320.png)
- [390pxの記録入力](recording-390.png)
- [430pxの記録入力](recording-430.png)

入力画像は `recording-accessibility.spec.ts` の幅別テストで撮影。高さ720px、主要操作48px、ナビとの重なり、12px以上の補助文字を確認しています。文字200%、高さ420px、safe area相当20/34pxの置換は同テストで別に検証します。これはOSキーボードやPWA standalone実機の検証を代替しません。種目一覧画像は `training-experience.spec.ts` で再撮影できます。
