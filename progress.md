# progress.md

## 2026-09-07 00:47 JST

- 変更内容: docs内のPDF2点・画面参考画像、既存実装、既存テスト、task.mdを確認した。READMEをGO TORE向けに再構成し、CONTRIBUTING.md、資料一覧、現状整理、段階的実装・モバイル移植の開発方針、機能追加・不具合・週次計画のIssueテンプレートを追加した。AGENTS.mdとPRテンプレートをチーム開発の運用に合わせて更新した。
- 目的: 現行システムとの差分をIssueにし、必要な機能を先に完成させ、複数人で毎週追加・修正するための共通手順と判断の根拠を用意する。
- 影響範囲: 開発文書、Issue・PR運用、依存のセットアップ、検証コマンド、backend CI。アプリの画面・API・DBの挙動は変更していない。
- 関連ファイル: README.md、CONTRIBUTING.md、AGENTS.md、docs/README.md、docs/current-state.md、docs/development-policy.md、.github/ISSUE_TEMPLATE/*.md、.github/pull_request_template.md、Makefile、.github/workflows/ci.yml、task.md。
- 変更内容（環境）: `make install` と `make check` を追加。通常の依存インストールはuvの `--locked` とBunの `--frozen-lockfile` を使い、backendの起動・検証・CIもlockfileに従う形に統一した。既存lockfileは変更していない。
- テスト方針: 文書・テンプレートと既存コマンドの統合が対象で、アプリ仕様を追加していないため、新しい失敗テストは先行追加せず、構造検査と既存のlint・テスト・buildで確認した。
- 確認結果: backend lint成功、既存pytest 1件成功、frontend lint成功、frontend本番build成功。`make -n install check`、Issueテンプレート3件のfrontmatter、CI YAML、文書内のローカルリンク25件、`docker compose config --quiet` を確認した。
- 検証上の補足: 制限環境ではPDF読取ライブラリとbackendのビルド依存の取得時にDNSエラーが発生したため、許可された制限外実行で取得した。pytestも制限環境で応答待ちになったため中断し、30秒上限の制限外実行で同じ既存テストの成功を確認した。アプリ依存にPDFライブラリは追加していない。Dockerコンテナの起動、DB migration実行、リモートCIは未実施。
- 未解決事項: 発表用MOCKのNeon・`/svc/api`・固定履歴等と現行基盤のSupabase・`/api`の採用範囲をユーザーへ確認中。frontend動作テスト・E2E、DB CLIのバージョン統一は後続Issue候補。GitHubのブランチ保護・レビュー必須設定の状況は未確認で、今回外部変更はしていない。開始時から未追跡だった資料PDF2点・画像1点は変更もステージングもしていない。
- 次のアクション: 初版の用途・採用仕様を確定する。チーム共有時は既存の資料3点をGitで管理するか確認し、共有する。GitHub管理者がmain保護・CI必須設定を確認し、週次計画テンプレートから今週のIssueと担当を決める。
