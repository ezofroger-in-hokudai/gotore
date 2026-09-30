# 現行仕様のテスト責務

## 基礎と変更時の運用

- 数値計算・入力制約・状態遷移はbackend/frontend単体テストで境界値を確認する。E2Eは画面から保存・復元・共有する接続を確認する。
- `frontend/tests/e2e/fixtures.ts`を全specの入口とする。通常のpageの未処理例外を失敗にし、失敗時はAPIのパス・method・statusを添付する。queryや認証情報は記録しない。追加contextを作る実ユーザーテストは各pageの例外も確認する。
- `mock-training.ts`は共通の起動・記録操作と状態を保持するAPI fixture。実Auth/DBは`integration/`へ置く。mockの成功だけで永続化・権限の成功とは扱わない。
- 修正のたびに専用specを増やす前に、下表の既存ファイルへケースを追加・更新する。画面変更と同じPRで仕様・テストを更新する。
- 幅ごとの確認は配置・操作領域・はみ出しが対象。幅に依存しない業務操作は1回とし、必要なレイアウトは同じ状態で320/390/430pxを確認する。
- 削除は確認対象の廃止か重複に限る。移行先と理由を本資料へ記録する。失敗を避けるskip・retry増加・CI対象の削減はしない。
- screenshotは`test-results/`へ出力する。採用デザイン画像を通常テストで上書きしない。

## 主な確認先

| 責務 | 確認先 |
| --- | --- |
| 開始→記録→終了→履歴の主導線 | training-lifecycle、session-flow |
| 開始待ち・再試行・入力保持 | training-start-performance、pending-save-input |
| 記録の端末保存・再送・復旧 | session-background-send、session-recovery、queue-storage、integration/compressed-save |
| 記録画面・全セット・文字拡大・低い画面 | recording-style、recording-accessibility、visible-sets、comparison-scroll |
| メモ取得・競合・下書き復旧 | memo-loading、memo-recovery、workout-memo |
| BESTのrevision・訂正・履歴/共有への反映 | personal-records、backend BESTテスト |
| 個人履歴の日付・集計・日別操作 | personal-history、activity-heatmap、workout-management、workout-reuse |
| グループ履歴・期間・グラフと権限 | group-history-calendar、integration/analytics |
| 表示保持・再取得・要求共用 | display-reuse、shared-detail-performance、record-snapshot、refresh-retention |
| 招待リンク・共有権限・退出 | invite-links、membership、integration/group-real-flow、integration/sharing |
| スタンプ送受信・既読・取消 | stamp-receipt、inline-stamps、integration/stamps |
| 認証・アバター・提案の実保存 | integration/login-only、integration/avatar-sharing、integration/suggestions-live |

## 今回の移行・廃止

| 旧ファイル/確認 | 現行の確認先・理由 |
| --- | --- |
| training-experienceの5ケース | 全セット→visible-sets、開始失敗→training-start-performance、履歴読み込み→personal-history、比較更新中のメモ→memo-loading、権限喪失→display-reuse。全ケースを移動して責務を揃える |
| recording-styleの業務操作3回 | 開始・コピー・編集・メモ・終了は1回。保存した同じ状態で3幅と2テーマのレイアウトを確認する |
| volume-result | training-lifecycleへ改名。現行の開始・終了・履歴・共有・採点API不使用を維持 |
| invite-code | invite-links。現行は招待リンク/QRを全メンバーが発行可能。旧コードの閲覧のみ権限制限をUI仕様として残さない。旧APIの権限はbackendで確認 |
| record-presentationの横並び・旧主ボタン配置 | recording-style。現行の今回/前回の配置・コピー・編集・テーマ・幅の確認へ統合 |
| record-presentationの旧overview BEST | personal-records。確定revision・未送信・古い応答・訂正と履歴/共有の炎を確認。旧同期表示や廃止overviewへ依存しない |
| unified-historyの統一週画面 | personal-history、group-history-calendar、integration/analytics。個人/グループの現行カレンダー・期間・集計・直接記録操作を確認。廃止済み週7枠/ランキング配置は検証しない |
| stamp-receipt-inlineの記録中常時表示・グループfooter | stamp-receipt。現在受信UIが存在する終了結果で6種類・既読・再試行・3幅を確認。実送信/取消はintegration/stampsに維持 |
| memo-recoveryの旧トレーニング全体メモ | 今日の種目メモの下書き・revision・再起動・端末保存失敗へ移行。履歴の本人メモはworkout-memoで維持 |

機能仕様の変更に合わせてこの対応表を更新する。ケース数の削減自体を完了条件にはしない。
