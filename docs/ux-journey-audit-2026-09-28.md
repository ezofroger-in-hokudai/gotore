# ユーザー導線の実操作監査（2026-09-28）

## 対象と方法

`main` の `0c46594` を独立した作業ツリーで起動し、390×844 CSS px のブラウザを Playwright で操作した。ローカル Supabase に監査専用の2アカウントと1グループを作成し、所有者と参加者の両方で画面を確認した。固定 START の重なりは DOM の矩形と `elementFromPoint` でも確認した。監査後、作成したグループと両アカウントは削除した。既存のテスト修正作業があるルート作業ツリーには触れていない。

| ユーザーの目的 | 実際に通した操作・状態 | 結果 |
| --- | --- | --- |
| 初回に始める | 新規ユーザーのホーム、グループ0件、START、種目選択 | 開始できた。グループ作成・参加への入口も確認 |
| 仲間と使う | グループ作成、招待QR／リンク、別ユーザーの参加確認、参加後の詳細 | 共有の基本導線を通過。手入力の参加画面の役割に迷いがあるため #224 |
| トレーニングする | ベンチプレス選択、重量・回数入力、1セット保存、終了、結果表示 | 一連の記録を完了。短時間の結果は `0分` となり #202 に観察を追加 |
| 仲間の状況を見る | 記録中・終了後に別ユーザーが共有画面を見る | LIVE／終了済みの表示へ遷移することを確認 |
| 自分の記録を振り返る | 履歴カレンダー、グラフ、記録詳細、コピー・編集・削除入口 | 直近記録が初期画面の下に隠れるため #222 |
| グループを振り返る | 一覧、詳細、最新記録、カレンダー、グラフ、設定、名前編集 | START とグラフ指標が重なるため #221。1グループでも並べ替え案内が出るため #225 |
| 設定を使う | アプリ設定、表示名編集、種目管理、使い方・ログアウトの位置 | START が設定行の右端へ重なるため #221。名前編集方式の違いは #186 に追記 |
| 小さい管理操作を押す | グループの作成・参加・招待ピル | 実操作と CSS を照合し、タップ領域が48px基準未満のため #223 |

既存のモックデータを使った画面も合わせて確認した。モックに履歴集計がない状態で出たカレンダー／グラフのエラー、画面遷移直後の取得途中表示は不具合として数えていない。320px・430px、文字拡大、実機のタッチ感、低速通信での追加確認は各 Issue の受け入れ条件へ残した。

## 新規 Issue

- [#221 固定 START がグループ指標と設定行に重なり、タップを奪う](https://github.com/ezofroger-in-hokudai/gotore/issues/221)
- [#222 個人履歴の初期画面から直近の記録へすぐ到達できるようにする](https://github.com/ezofroger-in-hokudai/gotore/issues/222)
- [#223 グループの作成・参加・招待ピルのタップ領域を48px以上にする](https://github.com/ezofroger-in-hokudai/gotore/issues/223)
- [#224 グループ参加画面で招待リンク貼り付けと外部QR読取の導線を明確にする](https://github.com/ezofroger-in-hokudai/gotore/issues/224)
- [#225 グループが1件のとき並べ替え案内を表示しない](https://github.com/ezofroger-in-hokudai/gotore/issues/225)

## 既存 Issue との整理

- #186 に、グループ名の行内編集と本人表示名のシート編集の実画面差を追記した。採用済みのグループ名操作を変更する判断はしていない。
- #202 に、短いトレーニングの終了後表示が `0分` になる観察を追記した。
- 画面遷移は #207、記録中のタップ領域は #110、保存・同期の案内は #185・#208、スタンプは #205 の範囲とし、今回の同種 Issue は増やしていない。

## 着手順の提案

1. #221 は誤ってトレーニングを開始する可能性があるため、配置・安全域を最初に決める。
2. #223 は既存の48px基準からの逸脱で、狭い端末の押し損ねを減らす。
3. #224 と #222 は画面構成の判断が必要なので、簡単なプレビュー比較を経て実装する。
4. #225 は独立した小修正として扱える。

今回の監査は Issue 化までであり、画面の仕様変更・実装は行っていない。

## 追加監査: 仲間の記録・入力・読み込み

同じ `main` を390×844 CSS pxで再操作した。写真未設定の仲間3人（うち2人は頭文字が同じ）、当日記録0件、前回値ありの種目を合成データで用意し、当日情報に2.2秒、共有記録詳細に1.5秒、前回値に2.2秒の遅延を別々に注入した。遅延はUIの変化を観察するための条件であり、本番の応答時間を示さない。初回のホームでは当日情報と記録詳細を表示し、その後STARTから種目選択・仲間シート・入力欄へ進んだ。

| 目的 | 観察 | 対応 |
| --- | --- | --- |
| 仲間をすぐ見つける | 写真なしの「田中太郎」「田中花子」は両方「田」。名前はシートを開くまで見えない。0件時には空の仲間領域が残る | [#228](https://github.com/ezofroger-in-hokudai/gotore/issues/228) |
| ホームで見た仲間を開始後も見る | 同じ当日APIを2回要求し、仲間アイコンが空の丸へ戻る。「すべて」タブの左端は166.5→118.5pxへ動く | [#227](https://github.com/ezofroger-in-hokudai/gotore/issues/227) |
| 同じ人のセットを開き直す | ホームで詳細取得済みでも同じ共有記録詳細を再要求。シートは汎用の「記録」と大きな空欄から始まる | [#230](https://github.com/ezofroger-in-hokudai/gotore/issues/230) |
| 最初のセットを確実に入力する | 前回62.5kg×8回の取得前は20kg×10回を表示し保存可能。待たずに押すと20kg×10回が実際に保存され、待つと入力欄が62.5kg×8回へ変わる | [#231](https://github.com/ezofroger-in-hokudai/gotore/issues/231) |
| 0件の今日の記録を理解する | 「0種目 0セット 0kg …」を開いても内容はなく、画面上はほぼ変わらない | [#229](https://github.com/ezofroger-in-hokudai/gotore/issues/229) |
| 通信待ちを気にせず記録する | 前回値を待つ間、種目メモ欄に可視の「メモを読み込み中…」が出る | [#232](https://github.com/ezofroger-in-hokudai/gotore/issues/232) |

### 画面と参考サービス

- [仲間が表示済みの種目選択](images/ux-journey-audit-2026-09-28/peer-ready.png)、[当日情報の再取得中](images/ux-journey-audit-2026-09-28/peer-loading.png)、[今日の記録がない状態](images/ux-journey-audit-2026-09-28/no-peer-record.png)。
- [仲間の記録を開いた直後](images/ux-journey-audit-2026-09-28/peer-detail-loading.png)、[詳細取得後](images/ux-journey-audit-2026-09-28/peer-detail-ready.png)。
- [前回値の取得前](images/ux-journey-audit-2026-09-28/context-pending.png)、[取得後](images/ux-journey-audit-2026-09-28/context-ready.png)。
- [Instagram公式のStories案内](https://about.fb.com/news/2025/09/in-india-instagram-debuts-a-reels-first-experience-for-its-mobile-app/)は人から見る入口の配置、[Hevy公式のソーシャル案内](https://help.hevyapp.com/hc/en-us/articles/35688036014231-Hevy-App-Social-Guide-Connect-Follow-and-Share-Your-Workouts)は記録者・統計・反応を同じ投稿で見る構成の参考とした。[Hevy公式の前回値と入力値の説明](https://help.hevyapp.com/hc/en-us/articles/34105442929943-Previous-Workout-Values-Vs-Routine-Values-How-to-Adjust-in-Settings)は参照値と保存する入力値を区別する検討材料とした。いずれもGO TOREへの採用は未決定。

読み込み全体は既存の[#11](https://github.com/ezofroger-in-hokudai/gotore/issues/11)に計測地点を追記した。[#184](https://github.com/ezofroger-in-hokudai/gotore/issues/184)には6種類のスタンプ横の `…` が別の反応にも見える観察、[#222](https://github.com/ezofroger-in-hokudai/gotore/issues/222)にはHevy・Stravaの履歴入口の比較を追記した。公開環境・実機の実時間、Auth/API/DB/描画の内訳、320/430pxと文字拡大は未測定。再利用する情報の期限・権限喪失時の破棄、仲間の名前表示形式、前回値の自動入力方式は各Issueで決める。
