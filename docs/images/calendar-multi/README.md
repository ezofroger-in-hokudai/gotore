# 部位の複数選択と文言整理（#140）

ローカルの本番ビルドをPlaywrightの架空データで撮影。個人情報・本番の記録は使用していない。

- calendar-320/390/430.png: 胸＋肩を選択。胸3,390kg＋肩360kg＝3,750kg、同じ1トレーニングを1件として表示。凡例と常設説明を削除。
- result-390.png: 完了の重複見出しと飾り文句を省き、総負荷・種目数・セット数を表示。
- history-detail-390.png: セットを展開した個人詳細では、種目名のまとめを繰り返さない。閉じると要約を再表示。

撮影元は frontend/tests/e2e/body-part-calendar.spec.ts と volume-result.spec.ts。幅別の折り返し・横スクロール、追加HTTPなし、0kg、旧API応答も同時に検証する。
