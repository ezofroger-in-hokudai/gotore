# PR #280の変更前・変更後

変更前: main `094f34a`。変更後: `c0b7e8f`。同じUI用合成ユーザー・API応答と同じ操作を両版で実行した実画面。画像加工なし。通常390×844、回転だけ844×390。外観は編集行だけダーク、他はライト。

| 対象 | 条件・違い | 変更前 | 変更後 |
| --- | --- | --- | --- |
| 設定 #278 | 正常取得後のホーム→設定。再取得を5秒保留し、再訪200ms後を撮影。名前・頭文字を保持 | [前](settings-before.png) | [後](settings-after.png) |
| 人体図 #279 | 初回のsnapshotと月別活動を503にする。同じタブで失敗と再試行を示し、記録なしとは表示しない | [前](body-error-before.png) | [後](body-error-after.png) |
| START #269 | 長押しで下へ移動し、844×390へ回転。画面外から画面内へ補正 | [前](start-rotation-before.png) | [後](start-rotation-after.png) |
| 編集行 #268 | ベンチプレス20kg×10回を追加して行を編集。文字が読めるテーマ色 | [前](dark-edit-before.png) | [後](dark-edit-after.png) |
| オーナー #270 | ミオの「オーナーにする」を押した直後。前はPATCH送信中、後は送信前の確認（PATCH0件） | [前](owner-before.png) | [後](owner-after.png) |
| 削除 #271 | DELETE応答を8秒保留。取消・閉じるの無効化と削除中表示 | [前](delete-before.png) | [後](delete-after.png) |

撮影は一時的なPlaywright手順で両版6画面ずつ完了。未処理pageerrorなし。画面比較用の合成応答であり、実Auth/DBの証跡はPR #280のdocs/images/audit-fixesを参照。恒久テストやアプリコードはこの資料PRで変更していない。
