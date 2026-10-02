# メモの状態表示の整理

変更前1009ea1（PR #282の直前版）、変更後は今回の表示修正。同じ合成ユーザー・API・操作、Chromium390×844、ライトで両版を起動。PNGは加工していない。

| 状態 | 変更前 | 変更後 |
| --- | --- | --- |
| 今日のメモ：Enter保存後200ms、PUT保留 | [前](inline-sending-before.png) | [後](inline-sending-after.png) |
| ホーム移動後：同じPUT503失敗 | [前](home-failure-before.png) | [後](home-failure-after.png) |
| 本人履歴の全体メモ：保存後200ms、PUT保留 | [前](workout-sending-before.png) | [後](workout-sending-after.png) |

通常の保存待ちは入力対象の小さなリングだけにし、受付済み・復元済み等の説明を省く。通信失敗は赤いAPIエラー文から短い未送信/再送へ変更。競合・入力を保持できない場合の案内と、確認した読み直し・入力保全は維持する。

画像6枚を目視確認。撮影用一時specは削除し、機能・表示・データ保護のテストだけ残す。実機/PWAは未確認。
