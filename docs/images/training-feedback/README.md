# PR #64 記録画面と最高記録の表示

2026-09-09、ローカルChromium・画面テスト用データで撮影。

- [記録入力と横並びRM](session-best-feedback.png): 390×720px、タッチ設定。説明行を省き、RMを横へ、次種目を左・次セットを右へ配置。確定した更新は赤色・炎だけで強調。`training-feedback.spec.ts`で撮影。
- [今回のトレーニングの最高記録](session-overview-bests.png): 390×720px。保存済みの該当セットを赤色・炎で強調。`record-presentation.spec.ts`で撮影。
- [種目一覧](session-overview.png): 430×720px。種目リストの末尾に「新しい種目を追加」を配置。`training-experience.spec.ts`で撮影。

320/390/430px、文字2倍、遅延・失敗・再送・再起動後もE2Eで検証。実機の指操作・OSキーボードや本番の通信時間は未測定。
