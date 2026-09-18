# #164 B案の記録画面

架空の記録を使った実アプリのChromium画像。720px高の320/390/430px幅で、メモ非表示時は5セットを完全表示する。メモ表示中は一覧内の表示行数を減らし、数値入力の位置と大きさを保つ。

- [320px](visible-sets-320.png)
- [390px](visible-sets-390.png)
- [430px](visible-sets-430.png)
- [メモ表示](visible-sets-memo.png)
- [種目情報](visible-sets-info.png)
- [終了確認](visible-sets-finish.png)

最高記録・部位は種目名から確認できる。従来の種目メモ・前回メモ・今回メモは色付きメモ欄内で編集できる。下書きのあるメモは再起動時にも表示する。表示切替の好みの永続化は今回追加しない。数値入力のNumberWheelは変更していない。

実機Safari・キーボードの実機検証は未実施。文字拡大・小画面・safe area相当はブラウザテストで確認する。
