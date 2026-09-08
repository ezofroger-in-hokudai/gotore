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

- [activity-heatmap.md](activity-heatmap.md): セット数の月別ヒートマップと日別記録。

- [exercise-options.md](exercise-options.md): 本人用の種目リスト、選択入力、追加・削除と履歴保持。


- [../README.md](../README.md): 初回セットアップ、日々の開発、環境変数、migration、検証の共通手順。
- [../supabase/README.md](../supabase/README.md): migrationの作成・検証・履歴管理、共有DBへの反映手順。日々のローカル更新は未適用migrationを適用し、resetは失ってよいデータでの再構築検証に限定する。

- [onboarding.md](onboarding.md): 初回利用ガイドの表示・保存・再表示。

- [daily-improvements.md](daily-improvements.md): 入力操作・表示名・グループ名変更の合意範囲。

- [admin-managed-accounts.md](admin-managed-accounts.md): テスト用アカウントの管理者発行、一般登録禁止、公開Authの設定。
- [vercel-supabase.md](vercel-supabase.md): Vercel Servicesの1プロジェクト構成、環境変数と公開前の手順。
- [standard-v0.1-scope.md](standard-v0.1-scope.md): ユーザー指定のグループ作成・記録・共有を完成ラインとする初版の仕様。
- [current-state.md](current-state.md): 現行実装と資料の差分。Issueを起こすときの出発点。
- [development-policy.md](development-policy.md): 段階的な実装と将来のAndroid／iOS対応の方針。
- [../CONTRIBUTING.md](../CONTRIBUTING.md): チーム開発・週次計画・レビューの運用。

## 仕様を変更するとき

1. 関連資料・コード・テストを確認し、Issueに現状と変更案を記載する。
2. 仕様矛盾や大きな判断はユーザー／チームに確認する。
3. 合意した内容を `docs/` のMarkdownへ追記し、元資料のどのページ・範囲を変更または採用したかを明示する。
4. `progress.md` に判断の経緯を残し、実装・テスト・PRを紐付ける。

元のPDFを暗黙に読み替えません。新しい文書の追加・適用範囲の確定に合わせて、この一覧も更新します。
