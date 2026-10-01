# メモの保存待ち改善（#174）の変更前・変更後

変更前: main094f34a。変更後: fix/174-memo-delivery。両版へ同じUI用合成ユーザー・API応答・操作を実行した実画面。390×844、ライト、画像加工なし。

| 状態 | 変更前 | 変更後 |
| --- | --- | --- |
| 今日のメモをEnter保存。PUTを保留して200ms後 | [前](inline-sending-before.png) | [後](inline-sending-after.png) |
| 上の送信中にホームへ移動し、PUTを503で完了 | [前](home-failure-before.png) | [後](home-failure-after.png) |
| 本人の日別全メニューで全体メモを保存し、PUTを保留して200ms後 | [前](workout-sending-before.png) | [後](workout-sending-after.png) |

前は保存中の編集欄が無効のまま残り、ホームでは失敗が隠れる。後は編集を閉じても送信状態が残り、別画面の失敗を対象付きで再送できる。全体メモは編集欄を閉じるためシートの高さも縮む。同じ操作から生じたレイアウトの違いとして撮影した。両版2シナリオずつ完了、pageerrorなし。実Auth/DBの本人メモ・共有保護はintegration/sharing.spec.tsで別に検証。
