# 資料の案内

## プロダクト資料

| 資料 | 役割・適用範囲 |
| --- | --- |
| [GO TORE シンプル版.pdf](<GO TORE シンプル版.pdf>) | 37ページの発表資料。合トレの価値と将来構想。掲載されている案・料金等をそのまま実装要件にはしない |
| [GOTORE_MOCK_IMPLEMENTATION_SPEC.pdf](GOTORE_MOCK_IMPLEMENTATION_SPEC.pdf) | 2026-09-05の発表用MOCK実装仕様、23ページ。初版への採用・変更範囲はstandard-v0.1-scope.mdに記録 |
| [screens_montage.png](screens_montage.png) | 8画面の視覚参考。表示された数値や固定データを実装済みとはみなさない |

MOCK仕様は、単一グループ・各参加者の最新記録1件・固定の過去履歴・固定AI回答など、短時間の発表体験向けの制約を含みます。
PDF内から参照されているNotionのv1.3仕様などは、このリポジトリには含まれていません。
参照先の内容を推測して要件を補わず、必要な機能の着手時に採用する仕様を確認します。

## 開発用の文書

- [スタンプ](stamps.md): グループ内の送信・取消、記録中の受信表示、未読・受信一覧。

- [Googleで登録・ログイン](google-signin.md): 基本権限のみの認証、初回表示名、登録制限、egotore.com向け設定手順。管理者発行限定の初版仕様から変更する。

- [次の実装候補と着手順](implementation-review-2026-09-14.md): 記録・速度・共有・種目管理等の棚卸しと週次#149への対応。

- [起動キャラクターとアイコンの比較](mascot-options.md): ウォンバット2案・現行ハムスター・ラッコの動く比較。Aの丸いウォンバットを採用。

- [部位ヒートマップ](body-part-calendar.md): 日付セルの部位、横一列のフィルター、現在分類による過去記録の表示。

- [ライブ表示とプロフィール画像](live-presence-avatars.md): 記録中の赤丸・LIVE、新着表示と設定からの画像変更・閲覧範囲。

- [GOTORE v2 実装仕様](gotore-v2-spec.md): 2026-09-09合意の全所属グループ共有、終了・復元、LIVE、記録・BEST・種目メモ。v2実装では旧業務仕様との差分を本書で適用する。
- [GOTORE v2 引き継ぎ](gotore_v2/GOTORE_v2_Codex_handoff/gotore-v2-handoff/README.md): Figma確定版v2の画面・操作、全33状態、主要9画像、トークン、受け入れ条件。業務ルールには未決定事項を含む。
- [GOTORE v2 整合性レビュー](gotore-v2-review.md): 現行仕様・実装との照合結果、試作遷移の差分、実装前に必要な判断と推奨案。提案は未承認で、既存業務仕様を上書きしない。

- [design-system.md](design-system.md): スマホアプリを見据えた色・文字・余白・操作と共通部品の基準。[画面見本](design-preview.html)。

- [performance-best-history.md](performance-best-history.md): BEST・前回比較の履歴件数別計測と既存集計の利用。

- [loading-performance.md](loading-performance.md): 読み込み速度の比較、認証接続の再利用、自分の記録の再訪、計測。

- [ui-copy.md](ui-copy.md): 短いラベルと初回ガイドへの説明集約。
- [画面文言の再棚卸し](ui-copy-review-2026-09-13.md): 削減候補37件と今回採用する範囲。
- [history-analytics.md](history-analytics.md): 種目別の履歴グラフ、グループの推移・ランキングと集計・先読み。
- [score.md](score.md): SCOREの計算式・基準回・目標・採点保存の設計案。初版への採用と実装状況は [score-implementation.md](score-implementation.md) を参照。
- [activity-heatmap.md](activity-heatmap.md): 日別総負荷量の月別ヒートマップと日別記録。
- [personal-record-highlights.md](personal-record-highlights.md): 履歴・記録・共有の最高重量/RMを炎と赤字で示す条件と取得方法。
- [exercise-body-parts.md](exercise-body-parts.md): A案の部位別選択、主部位・補助部位の保存と編集、既存候補の移行。
- [exercise-options.md](exercise-options.md): 本人用の種目リスト、選択入力、追加・削除と履歴保持。
- [../README.md](../README.md): 初回セットアップ、日々の開発、環境変数、migration、検証の共通手順。
- [../supabase/README.md](../supabase/README.md): migrationの作成・検証・履歴管理、共有DBへの反映手順。日々のローカル更新は未適用migrationを適用し、resetは失ってよいデータでの再構築検証に限定する。
- [共有記録の要約](shared-workout-summary.md): ホームの種目数・セット数と既存応答での集計。
- [onboarding.md](onboarding.md): 初回利用ガイドの表示・保存・再表示。
- [invite-code.md](invite-code.md): オーナーによる招待コード再発行・旧コード無効化。
- [workout-management.md](workout-management.md): 本人の記録訂正・削除、競合と再送。
- [daily-improvements.md](daily-improvements.md): 入力操作・表示名・グループ名変更の合意範囲。
- [admin-managed-accounts.md](admin-managed-accounts.md): テスト用アカウントの管理者発行、一般登録禁止、公開Authの設定。
- [vercel-supabase.md](vercel-supabase.md): Vercel Servicesの1プロジェクト構成、環境変数と公開前の手順。
- [standard-v0.1-scope.md](standard-v0.1-scope.md): ユーザー指定のグループ作成・記録・共有を完成ラインとする初版の仕様。
- [current-state.md](current-state.md): 現行実装と資料の差分。Issueを起こすときの出発点。
- [development-policy.md](development-policy.md): 段階的な実装と将来のAndroid／iOS対応の方針。
- [../CONTRIBUTING.md](../CONTRIBUTING.md): チーム開発・週次計画・レビューの運用。
- [group-membership.md](group-membership.md): グループ退出・除外と本人履歴保持。
- [workout-reuse.md](workout-reuse.md): 本人の過去記録を新規下書きへコピー。
- [private-workout-memo.md](private-workout-memo.md): 本人だけの記録メモと非共有API。
- [ios-options.md](ios-options.md): iOS移植の方式比較・認証／下書きの境界・公式資料と実機検証案。
- [issue-review-2026-09-08.md](issue-review-2026-09-08.md): 今回のIssue実装・PRと、残る実機／仕様／運用条件。
- [issue-review-2026-09-10.md](issue-review-2026-09-10.md): 仕様・実装の監査、再現結果と表示・保存の計測、不具合・高速化・未採用機能案の16件のIssue。

## 仕様を変更するとき

1. 関連資料・コード・テストを確認し、Issueに現状と変更案を記載する。
2. 仕様矛盾や大きな判断はユーザー／チームに確認する。
3. 合意した内容を `docs/` のMarkdownへ追記し、元資料のどのページ・範囲を変更または採用したかを明示する。
4. `progress.md` に判断の経緯を残し、実装・テスト・PRを紐付ける。

元のPDFを暗黙に読み替えません。新しい文書の追加・適用範囲の確定に合わせて、この一覧も更新します。

送信待ち保存形式と旧データの互換性は [差分保存](queue-storage.md) を参照。

- [セット保存の通信量](session-transfer.md): gzip送信の互換性・制約・ローカル比較（#77）。

- [記録閲覧の3案と履歴エラー調査](record-review-options.md): 本人・共有詳細の比較、端末キャッシュ案（採用前）。

現在の表示名は **E-GOTORE**。名称の適用範囲は [現在のシステム](current-state.md) を参照。過去資料の名前・ファイルパスは維持する。

- [設定の目安箱](suggestion-box.md): 非公開の投稿、再送・入力制約、Supabase管理画面での確認手順。

- [testing.md](testing.md): 開発中の対象テスト、レビュー前とCIの全件検証、並列数と計測。
