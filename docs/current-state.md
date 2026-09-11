# 現在のシステム

更新日: 2026-09-09（v2実装ブランチ）。実装Issue: [#1](https://github.com/ezofroger-in-hokudai/gotore/issues/1)。
初版の完成ラインはユーザー指定の「グループ作成・記録・記録共有」です。
仕様とMOCK資料からの変更点は [standard-v0.1-scope.md](standard-v0.1-scope.md)、検証結果は [progress.md](../progress.md) を参照してください。

v2の画面・共有・セッションの規則は [gotore-v2-spec.md](gotore-v2-spec.md) を優先します。開始時の全所属グループ共有、終了ボタンによるセッション確定、サーバーからの再開、LIVE/TODAY、前回比較・BEST・種目メモを追加しています。本番へは未反映です。

## 実装した機能

追加実装ブランチでは、LIVEの右下の赤丸・ラベル、新着の強調、設定からのプロフィール画像変更を追加。[仕様と反映条件](live-presence-avatars.md)を参照。画像用migration `20260909120000_profile_avatars.sql` をAPIより先に適用する。画像は本人と現在同じグループのメンバーだけが取得できる。

| 機能 | 動作 | 主な配置先 |
| --- | --- | --- |
| アカウント | 管理者発行、ログイン・ログアウト。設定で本人の表示名を取得・変更・同期。Auth未設定時はDBの既存名を保持（#29）。APIがトークンと認証設定の形式を検証 | frontend/src/features/settings/、auth-panel.tsx、backend/app/api/dependencies.py |
| グループ | 作成・招待参加・一覧・メンバー表示。名称変更・招待コード再発行・退出・メンバー除外。退出・除外後は本人の履歴を残して共有解除 | features/v2/community.tsx、group-name-form.tsx、backend/app/services/training.py |
| 記録 | 本人用の種目リストから選択し、候補の追加・削除も可能（#28）。v2では1セットずつ端末へ即時追加し、DBへ順序付きでバックグラウンド保存。連続ホイール・直接入力・全セット一覧の前回比較・RM・BEST・常時表示のメモ。明示終了まで継続し、未保存入力は同じ端末で復元。旧記録の編集フォームは維持 | features/session/、workout-form.tsx、backend/app/domain/session.py |
| 共有 | v2は開始時の全所属グループへ保存済みセットを共有。旧記録の共有範囲は維持。メンバー限定のLIVE/TODAYと最新記録 | backend/app/infrastructure/training_repository.py、record-list.tsx |
| 自分の記録 | 本人の編集・削除・コピー・非共有メモ。日別最高SCOREの月間ヒートマップと日付タップによる絞り込み。実記録を50件ずつ閲覧 | frontend/src/features/activity/、training/training-app.tsx |
| 使い方 | 初回ガイドと設定からの再表示。通常画面は短い文言へ統一（#48） | frontend/src/features/onboarding/ |
| ホーム画面起動 | Web manifest、standalone設定、PNGアイコン、安全領域。オンライン利用が前提 | frontend/src/app/manifest.ts、apple-icon.tsx、layout.tsx |
| DB・設定 | migration、RLS、外部キー・一意制約、ローカル設定の生成 | supabase/migrations/、scripts/configure_local.py |

公開APIは `/api`。ローカルではNext.jsからFastAPIへ転送します。
Vercel Servicesでは1プロジェクトの共通ルートから各サービスへ振り分けます。設定は [vercel-supabase.md](vercel-supabase.md) を参照してください。ユーザーが公開サイトをデプロイし、migration適用を報告済みです。公開Authの登録制限・手動発行・URL設定は [管理者登録ガイド](admin-managed-accounts.md) に従って管理者が反映します。各リリースの本番反映は管理者が確認します。
業務データはFastAPI経由で操作し、ブラウザからのDB直接アクセスはRLSで拒否します。
追加の名称設定・入力操作の仕様は [daily-improvements.md](daily-improvements.md)。#4のメール／パスワード変更は後続です。名称設定・入力改善はPR #27でmainへ統合済みです。#29の名前保持修正はPR #32でmainへ統合済みです。本番反映はこの記録で保証しません。最新のレビュー・検証状況はPRとprogress.mdで追跡します。
ローカルSupabaseのプロジェクトIDは `gotore`、ポートは59320番台です。

## 検証

- backend: 入力制約・認証・グループ参加・共有範囲・再送・DB直接アクセス拒否・接続プール設定のテスト。
- frontend: 下書き復元・入力制約・ホーム画面設定の単体テスト。
- E2E: 一般登録拒否、ログイン専用UI、管理者作成アカウントでのログイン・グループ作成・参加・記録共有、通信再試行、下書き復元、再ログイン。
- ホーム画面: manifest・メタ情報・PNG配信をブラウザで検証。ユーザーがHTTPS公開済みだが、iPhone／Android実機での追加・再起動確認は未実施。
- CI: backend／frontend／database。PostgreSQL統合テスト、Supabase migration、ブラウザテストを含む。
- 最新の実施結果と未実施項目は `progress.md` に記録する。

## 後続で扱うもの

スタンプ、仲間へのコメント、Push通知、アカウント管理、公開環境へのデプロイ、Android／iOSアプリ。履歴グラフとグループ集計は #97 の範囲を追加（検証・PRの状態はprogress.md）。

今週追加するものは、初版を使って確認した結果からIssueにします。
GitHubのmain保護・レビュー必須設定は、管理者が設定状況を確認してください。

#35（親#14）の追加仕様は [activity-heatmap.md](activity-heatmap.md)。当初の指標はセット数で、PR #101への追加指定により日別最高SCOREへ変更する。v2ではBESTを追加し、#97で種目別の重量・推定1RM・セット数・総負荷の推移とグループランキングを追加。SCOREは #99 で #13 の算式を採用し、記録ごとの点数を追加する。SCORE化では保存済み本人得点の追加migrationを使う。検証・PRの状態はprogress.mdと週次計画#33で追跡する。

#28の追加仕様は [exercise-options.md](exercise-options.md)。公開前に追加migrationを適用する。候補を削除しても過去記録・下書きは保持する。検証とPRはprogress.md・週次計画#33で追跡する。

2026-09-08の追加実装と残る条件は[Issue確認記録](issue-review-2026-09-08.md)にまとめています。#48の統合PRは上表の機能を含みます。マージ・CIの確定結果はGitHubとprogress.mdを参照してください。

追加migrationは種目リスト・記録revision/削除済みID・本人メモの3件です。公開DBへの適用はAPI更新前に行います。今回の統合で本番DB操作は実施していません。

## v2の適用手順

1. `20260909040000_sessions.sql` をAPI更新前に適用する。ローカルは `make db-migrate`。既存データ・非共有範囲を維持する追加migrationで、DBリセットは不要。
2. FastAPIとNext.jsを同じリリースで更新する。既存 `/workouts` APIは残し、進行中の記録更新には `/sessions/{id}` を使用する。
3. 新規 `/sessions`、`/sessions/active`、`/sessions/{id}/finish`、`/sessions/{id}/heartbeat`、`/groups/{id}/activity`、`/groups/preview`、`/exercises/context`、`/exercises/memo` を使用する。OpenAPIに入出力を掲載。
4. 専用 `_test` DBを指定した `make check` と、ローカルSupabase上の `make test-e2e` を実行する。通知は [#21](https://github.com/ezofroger-in-hokudai/gotore/issues/21) で後続対応する。

開始中はDB上1人1件の制約、セットと終了はrevision照合・再送照合、共有は本人・所属の複合外部キー、退出/除外のcascadeで整合性を保つ。新しい3テーブルにもRLSを適用し、ブラウザからの直接操作は許可しない。

記録操作の改善では追加migrationはありません。送信待ちはユーザー別に端末へ保持し、アプリ表示中に再送、閉じた場合は次回起動時に再開します。未送信分がある状態で終了すると、同期を確認してからサーバーへ終了を送ります。競合時は端末データを保持し、確認なしに上書き・破棄しません。

## #61・#62の操作改善

記録ホームに進行中の全種目・セットを表示し、次の種目選択と独自種目の直接登録へ進める。比較セットは全行を一覧内でスクロールし、重量・回数と「次のセットへ」「次の種目へ」を画面内に保持する。開始待ちの種目選択、本人・グループ情報の画面内キャッシュ、バックグラウンド再確認、読み込み前からのカード・カレンダー・メモ領域を追加した。保持範囲・権限エラー時の破棄は[読み込み仕様](loading-performance.md)を参照。追加migrationは不要。検証結果はprogress.mdに記録する。

PR #63後の追加修正では、端末へ追加したセット番号・サーバー同期状態と次の番号を表示し、タッチ後のホバー残留を解消する。種目追加はリスト末尾、次種目は保存の横、終了は上部の枠付きボタンとし、確定BESTを赤色・炎で強調する。開始・保存・終了等のSQL往復削減と比較結果も[読み込み仕様](loading-performance.md)に記載。追加migration・環境変数は不要。

PR #64への追加指定では、次種目を左・次セットを右へ変更し、比較RMを数値の横へ置く。BESTの説明文言は除き、今回のトレーニング一覧も赤色・炎で強調する。本人限定の`GET /sessions/{id}/bests`を追加し、保存済み内容とrevisionを基準に再起動・訂正後も再計算する。API側の接続プールにはPsycopgのpool拡張を追加。依存を`make install`で同期し、任意の`DATABASE_POOL_MAX_SIZE`（既定4・0で無効）を設定できる。追加migrationは不要。

## 履歴グラフ・グループ集計

#97 の合意仕様は [history-analytics.md](history-analytics.md)。個人の種目別推移、日/週/月集計、グループの量・活動・最高重量/RM・成長の比較を提供する。集計用の追加migration `20260911090000_workout_statistics.sql` を使用し、保存と同一トランザクションで記録ごとの集計を更新する。ブラウザでは先読みと容量を制限したキャッシュを使い、指標と粒度を通信なしに切り替える。

## SCORE・個人目標・終了後の一言

#99 の実装仕様は [score-implementation.md](score-implementation.md)。開始時の目標を固定し、終了後の内訳・AIの一言・ホームと履歴のスコアを追加。目標はAI提案を本人が確認・編集して保存する。目標・コメントは本人だけに表示する。追加migrationとAPI専用 `OPENAI_API_KEY`（AI利用時）が必要。記録保存と数値の内訳はキーなしでも動く。週月SCOREランキングの集約方法と実モデルの品質・速度検証は後続。検証・PRの状態はprogress.md。

PR #101への追加では、ホーム右側・終了結果の得点を強調し、色を日別最高SCOREヒートマップと統一する。低得点は青、高得点は赤、紫を使わない連続グラデーションとし、未実施日は灰色にする。月集計用の確定個人点を追加migration `20260912020000_personal_score_totals.sql` で保持する。目標条件の期間選択欄は省き、期間が必要な条件は文章で確認する。
