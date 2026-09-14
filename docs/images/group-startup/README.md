# グループ切替と起動時の表示準備

390×844のChromiumで、同じテスト用アカウントのグループ活動と種目一覧の応答を保留/解放して撮影。

- [初回データを準備中](startup-preparing-390.png): グループや人数の未取得表示を見せずウォンバットを表示。
- [準備後のホーム](startup-ready-390.png): グループ人数・最新記録の空状態・操作可能なSTARTが揃った画面。

実行: `frontend`で`PLAYWRIGHT_REUSE_SERVER=1 bunx playwright test tests/e2e/startup-ready.spec.ts`。
スワイプは`group-order.spec.ts`で320/390/430px、連続・逆方向・長い操作・長押しを検証する。実機Safari/Android/PWAの操作感は未確認。
