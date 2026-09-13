# 最高重量・最高RMの表示（#134）

- [履歴一覧](personal-record-history.png)
- [本人の記録詳細](personal-record-detail.png)
- [グループの共有詳細](personal-record-shared.png)
- [記録中の比較](personal-record-recording.png)
- [グループのフィード](personal-record-feed.png)

Next.jsの実装画面を390px幅のChromiumで操作して撮影。UI確認用の架空データを使用する。重量だけが最高のセットとRMだけが最高のセットを分け、該当する数値を赤字にする。判定・本人限定/共有・訂正後の反映は専用DBのAPIテストで検証する。

320/390/430pxで横はみ出しと記録ボタンを確認する。実機の操作感は未確認。
