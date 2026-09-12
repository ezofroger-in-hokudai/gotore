# 開始前の振り返りと初回SCORE

#102/#103の画面確認用画像。Playwrightの固定記録・固定AI応答で撮影し、実ユーザーの記録や実モデルの出力は含まない。

- `training-overview-320.png` / `training-overview-390.png` / `training-overview-430.png`: 開始前の前回記録と最近4回の総負荷。バックグラウンドで更新を待っていても開始できる。
- `score-result-320.png` / `score-result-390.png` / `score-result-430.png`: 10回×3セットの初回基準と目標評価が各100点の終了画面。
- `score-home.png`: 共有フィードの右側に確定点を表示。個人目標・コメントは共有しない。

再現: `frontend/tests/e2e/training-overview.spec.ts` と `frontend/tests/e2e/score.spec.ts`。
