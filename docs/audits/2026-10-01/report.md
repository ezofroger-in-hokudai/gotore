# マージ後のユーザー操作・デザイン調査（2026-10-01）

## 対象と方法

- main `094f34a16c7b3e7512175259cb6808566c9e6d89`（PR #266マージ後）。ローカルSupabaseの実Auth/DB、調査用ユーザー2人。
- 導入済みChromiumで継続操作。390×844、長文・狭幅は320×720、回転は844×390。一般ユーザーのブラウザ操作を使い、3回の開始→記録→終了を実施。
- ホーム、記録/訂正、今日のメモ、終了/本人履歴、日別メモ、グラフ/人体図、グループ作成/招待参加/メンバー管理、名前変更/外観/触覚/種目管理を確認。
- 通信失敗・危険操作の調査に限り、当該APIを保留/503にして状態を再現。オーナー変更はPATCHを捕捉して503で中断。削除は削除専用グループだけで実施。既存の利用者や本番DBは操作していない。
- 既存Issueと2026-09-30の調査を照合。再現できた不具合5件と、観測したUI差分からの改善候補5件を起票した。後者は実機ユーザー研究で定量評価した結果ではない。

## 起票一覧

| 区分 | Issue | 内容 | 証跡 |
| --- | --- | --- | --- |
| 不具合/導線不足 | [#267](https://github.com/ezofroger-in-hokudai/gotore/issues/267) | 今日の種目メモを終了後の本人履歴から読み返し・再保存できない | [画面](images/today-memo-history.png) |
| 不具合/導線不足 | [#268](https://github.com/ezofroger-in-hokudai/gotore/issues/268) | ダーク外観で編集中セットの重量・回数が淡い背景に埋もれる | [画面](images/dark-edit.png) |
| 不具合/導線不足 | [#269](https://github.com/ezofroger-in-hokudai/gotore/issues/269) | 保存したSTART位置を画面回転後に補正せず、開始ボタンが画面外へ消える | [画面](images/start-rotation.png) |
| 不具合/導線不足 | [#270](https://github.com/ezofroger-in-hokudai/gotore/issues/270) | オーナー移譲が対象・権限変更の確認を挟まず、その場でPATCHされる | [画面](images/owner-menu.png) |
| 不具合/導線不足 | [#271](https://github.com/ezofroger-in-hokudai/gotore/issues/271) | グループ削除送信後も「キャンセル」で閉じられ、処理を取り消せたように見える | [画面](images/delete-pending.png) |
| デザイン改善候補 | [#272](https://github.com/ezofroger-in-hokudai/gotore/issues/272) | 種目管理の「キャンセル」が追加と部位編集で別のボタンに見える | [画面](images/catalog-add.png) |
| デザイン改善候補 | [#273](https://github.com/ezofroger-in-hokudai/gotore/issues/273) | 本人の表示名とグループ名で、名前変更の画面・確定操作が異なる | [画面](images/profile-edit.png) |
| デザイン改善候補 | [#274](https://github.com/ezofroger-in-hokudai/gotore/issues/274) | メモの保存タイミングが画面で異なり、どのメモかも見分けにくい | [画面](images/today-memo-edit.png) |
| デザイン改善候補 | [#275](https://github.com/ezofroger-in-hokudai/gotore/issues/275) | 触覚フィードバックのオン・オフに専用シートを開いて閉じる必要がある | [画面](images/haptic.png) |
| デザイン改善候補 | [#276](https://github.com/ezofroger-in-hokudai/gotore/issues/276) | ホームの人数2列で、LIVE以外の「人」が何を数えているか分かりにくい | [画面](images/home-counts.png) |

## 再現時の観測値

- #267: 今日の種目メモPUT成功後、終了→日別メモは空欄。通信503では本文とrevision=0が端末に残るが、終了確認に未送信メモの案内がなく、終了後の再保存導線がない。データが削除されたと判断していない。[失敗時](images/unsent-memo-finish.png)。
- #268: 編集行の淡い背景にダークのほぼ白い文字。重量・回数が読みにくい。操作サイズはユーザー指定の現行基準を変える提案ではない。
- #269: 自然な長押しドラッグでSTART位置をtop=510に保存。回転後の高さ390でもy=510〜590となり画面外。架空のlocalStorage値を注入せず確認。
- #270: 「オーナーにする」の1タップでowner PATCHが1件送信される。対象確認の次段階はない。採用資料は確認してから確定すると指定。
- #271: DELETE送信後もキャンセルが有効。押すとdialogが0件になり、要求は継続する。送信前の取消と誤認しやすい。
- #272: 追加フォームのキャンセル14px/1px枠/8px角丸/46.4px高に対し、部位編集は12px/枠なし/角丸0/44px高。[部位編集](images/catalog-edit.png)。
- #273: 本人名は別シートで保存と閉じる。グループ名は同じ行で決定/キャンセル。[グループ側](images/group-name-edit.png)。採用済みグループのインラインは維持する提案。
- #274: 今日の種目メモはEnter/blur、全体メモは保存ボタン。対象と保存規則の違いが分かりにくい。種目メモと全体メモの無断統合を提案しない。
- #275: 2値設定の触覚オン/オフに、設定行→チェック→閉じるの3操作が必要。説明と保存は維持して往復を減らす検討案。
- #276: ヘッダーはLIVE 0人/1人/1セット/200kg。人数2列目の意味の可視ラベルと個別aria-labelがない。採用した4列構造を維持する候補。

## 問題を起票しなかった確認

- 60文字の新規種目を追加して320×720で5セット保存。横幅320、追加ボタンx=137/y=594/幅160/高さ48で画面内。未処理ブラウザ例外なし。[記録画面](images/long-name-320.png)。#167に関連する確認だが、全受け入れ条件を確認したわけではないため既存Issueは閉じない。
- 3回の終了後、本人履歴の通算は1,400kg/3回/7セット。グラフの更新完了後も1,400kg。[グラフ](images/graph-320.png) / [人体図](images/body-parts-320.png)。再訪直後の保持中の400kgを集計の誤りとして起票しない。
- テスト整理・全件CIの旧課題#218は、PR #266のbackend300/frontend137/E2E283全成功と統合を確認して完了。重複Issueを作らない。

## 残る制約と次の判断

- 実機のタッチ、PWA、ソフトキーボード、スクリーンリーダーの実際の読み上げ、モバイル回線の時間測定は未実施。Chromeが調査ツールに未導入のため既存Chromiumを使った。
- 調査スクリプトでは遷移直後の対象指定/シート閉じ忘れで停止した箇所を修正し、実画面の状態を再確認した。スクリプトの停止をアプリ不具合と扱わない。
- 新規Issueはバックログ。実装担当・レビュー担当・週次計画は未定。改善候補は採用資料と比較してユーザー判断後に実装する。今回アプリコードは変更していない。

## 追加調査: 通信失敗からの復帰と設定の再取得

ユーザーの継続依頼により、同じアプリ版で実Auth/DBの操作を追加した。新規Issueは2件、初回と合わせて12件。今回もアプリコード・業務仕様は変更していない。

| Issue | 確認した問題 | 証跡 |
| --- | --- | --- |
| [#278](https://github.com/ezofroger-in-hokudai/gotore/issues/278) | 設定往復で受信済みプロフィールを破棄し、名前編集でも同じデータを追加取得する | [再訪](images/settings-refetch.png) / [編集失敗](images/profile-redundant-failure.png) |
| [#279](https://github.com/ezofroger-in-hokudai/gotore/issues/279) | 「使った部位」で活動取得失敗を「最近の記録はありません」と表示し、同じタブの再試行がない | [失敗時](images/body-network-failure.png) / [復帰後](images/body-network-recovered.png) |

### 繰り返し操作の結果

- #278: 設定の正常表示を待ち、データ変更せずホーム→設定を3回往復。GET `/api/me` 3件、GET `/api/me/avatar` 3件。再訪のprofile応答を保留すると表示名が空欄になる。正常表示後の名前編集でも追加GETが1件発生し、これだけ503にすると編集入力を表示できない。通信復帰後の「再試行」で編集可能。画像編集の追加取得はコード確認のみで、動的再現の根拠に含めない。#177の保存処理・結果追跡とは分けた。
- #279: 今日の記録がある同じユーザーを新しいブラウザコンテキストでログインさせ、初回snapshotと月別活動を503にする。端末複製なし/活動取得失敗の状態で、通算は正常APIにより1,400kg/3回/7セットなのに人体図は記録なし。tabpanel内のalert 0件/再試行0件。通信を戻してタブを往復すると胸・その他が今日として表示される。同じ失敗条件の再読み込みでも再現した。月初の前月だけが失敗する条件は未実施で、Issueの実装時検証条件に記した。
- 表示名の初回失敗後の再試行と、活動取得復帰後の部位表示は成功。データ消失・全APIの障害と誤って分類しない。一次ブラウザのpageerrorは0件。実回線の遅延時間・実機は未測定。

### 検証と次の作業

資料と画像だけの追加のため、リンク・画像・差分を確認する。アプリの全件テストはPR #266で成功した同じソースを調査しており、今回再実行していない。新規2件は未実装のバックログで、採用判断と週次計画は後続。調査用ブラウザ制御を恒久的なテストとして追加していない。

## 修正への接続

ユーザーが修正方針を承認した6件を[週次計画#281](https://github.com/ezofroger-in-hokudai/gotore/issues/281)へ選び、[修正PR #280](https://github.com/ezofroger-in-hokudai/gotore/pull/280)を作成した。

- #278: 設定一覧と名前/画像編集で取得結果を共有。直後の往復の再取得を省き、保存結果の反映・背景更新失敗・古い応答・別ユーザーの分離を検証。
- #279: 人体図の初回失敗/更新失敗/空を区別し、月初の前月だけの再試行と表示保持を検証。
- #269: 保存位置の復元/回転/visual viewportで補正。ドラッグ中の横座標を残さず左右端への吸着も維持。
- #268: ダークの編集行をテーマ色へ合わせ、数値のコントラスト4.5以上。操作サイズは変更していない。
- #270/#271: 移譲の対象と本人の権限変更を確認し、確定時だけ一度送信。危険操作送信中の取消/閉じる/背景/スワイプ/Escape/戻るを保護。15秒の通信期限と確認内の失敗表示を追加。

[修正後の実画面3枚](https://github.com/ezofroger-in-hokudai/gotore/tree/c0b7e8f/docs/images/audit-fixes)は修正PR側に保存。専用gotore_test DBのmake checkはbackend300/frontend137/lint/型/build成功。6160063の全件CI run 36803351293は全ジョブ成功、E2E293件成功（9.2分）。最終c0b7e8fの[CI run 36804421469](https://github.com/ezofroger-in-hokudai/gotore/actions/runs/36804421469)も全ジョブ成功、backend300/frontend137/全E2E293件成功（2 worker、9.2分）。

修正PR #280は2026-10-01 11:44にmain c5606f5へ統合されたことを確認した。本番反映・実機PWAはこの作業では確認していない。#267/#272/#275は後述のPR #282で採用・実装。#273/#274/#276は後続の画面設計/実装の判断が必要。


## 前後比較と次の実装

ユーザー指定により、PR #280へ[同条件の変更前・変更後12枚](comparison/README.md)を並べた。変更前main094f34a、変更後c0b7e8f。今後も画面を変更するPRには前後を載せる基準をCONTRIBUTINGとPRテンプレートへ記載。画像参照はコミットe547c9dに固定している。

継続実装依頼を受け、#174のメモ保存待ちを[PR #282](https://github.com/ezofroger-in-hokudai/gotore/pull/282)で改善した。端末受付後に閉じる・再編集・別画面の失敗/再送・再起動照合・ログアウト/別ユーザー分離。最新main取り込み後のmake check（backend301/frontend142/lint/型/build）、関連E2E31件（実Auth/DB含む）が成功。[前後6画像](https://github.com/ezofroger-in-hokudai/gotore/blob/2633da5bcb61628b121aefef1ed108d0c8052f15/docs/images/memo-delivery/README.md)もPRへ掲載。初回2633da5の全件CI run 36809353220は293成功/3失敗。メモ受付後に閉じる期待値2件と、終了API確定を待つ判定1件を修正。最終1009ea1の[最終CI run 36814312977](https://github.com/ezofroger-in-hokudai/gotore/actions/runs/36814312977)は全ジョブ成功、backend301/frontend142/全E2E299件成功（2 worker、10.0分）。

#267の本人履歴の各種目で閲覧・編集・再送、#272のキャンセル統一、#275の触覚設定の一覧スイッチは、継続依頼により提案した形で採用し、PR #282へIssue別コミットで実装。旧v1下書きの終了後復旧も確認。通常チェックはbackend301/frontend142/lint/型/build成功、関連23件/追加9件/最終7件成功（撮影4件・実Auth/DBを含む）。[追加の前後6画像](https://github.com/ezofroger-in-hokudai/gotore/blob/d221e49/docs/images/remaining-fixes/README.md)をPRへ掲載。未マージ、独立レビュー・実機未実施。
