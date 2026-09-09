# PR #63追加フィードバックの修正

2026-09-09、ローカルChromiumと画面テスト用データで撮影。

- [保存確定とBEST](session-best-feedback.png): 390×720px、タッチ設定。追加したセット番号、次に記録する番号、横並びの次種目ボタン、上部の終了ボタン、確定BESTの赤色・炎表示。`training-feedback.spec.ts`で撮影。
- [種目一覧](session-overview.png): 430×720px。種目リストの末尾に「新しい種目を追加」を配置。`training-experience.spec.ts`で撮影。

320/390/430px、文字2倍、遅延・失敗・再送もE2Eで検証。実機の指操作・OSキーボードや本番の通信時間は未測定。
