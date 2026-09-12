# ホームSTARTとグループナビ（#107）

Linux / Chromium、高さ844px。`start-navigation.spec.ts` の架空ユーザー・固定API応答で撮影した。

- [320pxのホーム](home-320.png)
- [390pxのホーム](home-390.png)
- [430pxのホーム](home-430.png)
- [進行中にグループを閲覧](groups.png)

ホームから直接開始し、主要画面の右下でSTART / RESUMEを操作できる。グループタブから選択中のグループを開く。入力とSheet表示中の非表示、開始待ち入力と同じセッションへの復帰をE2Eで確認する。

実機PWAの確認は未実施。manifestのstandalone設定とブラウザ幅での確認を、実機のキーボード・安全領域の実測としては扱わない。
