# グループスワイプの確認画像

2026-09-14、ローカルのChromiumと架空の3グループで撮影。最新main 9081ac1とスワイプ修正を統合したビルドを使用。

- [320px](group-swipe-320.png)
- [390px](group-swipe-390.png)
- [430px](group-swipe-430.png)

先頭カードを左へ60pxスワイプし、2枚目へ到着した状態。カードと選択ドット・最新記録のグループ名を確認する。途中の跳ね戻りと連続操作は静止画では確認できないため、`frontend/tests/e2e/group-order.spec.ts` の位置計測・時計を制御したタッチ操作で検証する。実機Safari/Android/PWAは未確認。
