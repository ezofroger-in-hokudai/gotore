# 総負荷表示（#130）

- [終了結果](result.png): 重量80kg×8回の1セットを終了し、総負荷640kgを即時表示。
- [活動カレンダー](calendar.png): 同日の全記録を合算した日別総負荷と月の総負荷。多い日は赤、少ない日は青、未記録は灰色。
- Chromium / 390×844px、架空のテストデータ。`volume-result.spec.ts` と `activity-heatmap.spec.ts` で撮影。
- 終了結果は320/390/430pxで横にはみ出さないことを確認。実機Safari/PWAは未検証。
