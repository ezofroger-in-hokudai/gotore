# 直近の履歴を優先する表示

ローカルChromium、架空ユーザー・記録50件のテストデータで撮影。最初は3件だけを表示し、もっと見るで通信を増やさず展開します。

- [320px](history-320.png)
- [390px](history-390.png)
- [430px](history-430.png)

高さ720px。`frontend/tests/e2e/history-priority.spec.ts` で再撮影できます。ページング・詳細からの復帰と表示幅も検証しています。実機の操作感は未確認です。
