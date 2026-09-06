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

## 2026-09-07 00:56 JST

- 変更内容: ユーザーの「スタンダード版をまず実装し、範囲を決める」という方針を受け、初版の実装範囲案を作成した。アカウント、トレーニング記録、実履歴、グループ、共有、スタンプを初版候補にし、Issueへの分割案と受け入れ条件を記載した。現状整理と資料一覧を更新し、task.mdに初版の仕様確定・実装タスクを追加した。
- 目的: 継続利用に必要な保存・共有を先に完成させ、ユーザーが具体的な範囲を確認してから機能実装へ進めるようにする。
- 影響範囲: 仕様案とタスク管理のみ。機能候補・共有ルール・技術構成は提案段階で、アプリ・DB・依存関係は変更していない。
- 関連ファイル: docs/standard-v0.1-scope.md、docs/current-state.md、docs/README.md、task.md。
- 確認結果: 現行コード・テスト・依存定義にアプリ固有の機能がないことを確認。文書のローカルリンクと差分の空白検査を実施。仕様案のみの変更のため、失敗テストの追加や既存アプリテストの再実行はしていない。
- 未解決事項: 初版候補への合意、1ユーザー1グループ等の制約、記録の共有・編集・退出時の扱い。SCOREとランキングは初版から外す提案だが、ユーザーの希望を確認する。既存の採点式はMOCK用の固定履歴に依存するため、採用する場合は実履歴に対する条件を先に確定する。GitHub Issueはまだ発行していない。
- 次のアクション: 範囲の確認後、仕様案を確定し、API・DB・入力条件・権限の詳細仕様とIssueを用意する。機能ごとのテストから実装へ進める。

## 2026-09-07 01:32 JST

- 変更内容: ユーザーの追加指定を受け、初版を「グループ作成・記録・記録共有」に絞って仕様を更新し、GitHub Issue #1を発行した。本人を識別するSupabase Auth、グループ作成と招待参加、記録保存、本人／所属グループの記録取得APIを実装した。
- 目的: 日々の実記録をDBに蓄積し、仲間と共有できる初版を完成させる。SCORE・AI・ランキング・スタンプ等は後続へ回す。
- 影響範囲: backendのAPI・認証・ドメイン制約・DB操作、PostgreSQL migration、SupabaseのローカルプロジェクトID・ポート。既存の他プロジェクトのコンテナやDBには触れていない。
- 関連ファイル: docs/standard-v0.1-scope.md、task.md、backend/app/、backend/tests/、backend/pyproject.toml、backend/uv.lock、backend/.env.example、supabase/config.toml、supabase/migrations/20260907010000_training.sql。関連Issue: https://github.com/ezofroger-in-hokudai/gotore/issues/1。
- 設計: 入力制約をdomainへ分離し、APIが検証した本人IDをserviceからDB操作へ渡す。グループ作成・参加、記録保存はトランザクションで確定する。保存IDの再送は同じ内容だけを許して重複や上書きを防ぐ。業務テーブルのRLSによりブラウザからの直接アクセスを拒否する。
- テスト結果: 入力テストを先に追加して未実装のimport失敗を確認後に実装。専用gotore_test DBでbackendの23テストが成功した。認証拒否、認証障害、メンバー限定の共有、個人記録の保持、再送の冪等性、DB直接アクセス拒否を含む。migrationは新規のgotoreローカルDBへ適用済み。DB lintはエラーなし。
- 検証上の補足: テストで独自ロールの権限を付与した際、ローカルSupabase PostgreSQLがsegmentation faultで復旧処理に入った。標準のauthenticatedロールを使用する検証へ変更し、23件の成功を再確認した。この同時刻に実行した初回E2Eは登録APIの500で失敗したため、DB復旧後に再実行中。GitHubコネクタのIssue作成は404だったが、リポジトリへアクセスできるghでIssue #1を作成できた。
- 未解決事項: frontendと実ブラウザでの結合確認、README・CIの最終整合確認が進行中。ローカルSupabaseにテスト専用gotore_test DBを作成済み。初版の編集削除・グループ管理・公開環境は対象外。
- 次のアクション: 実ブラウザ2人分で共有フローを検証し、画面・テスト・起動手順を仕上げる。

## 2026-09-07 01:56 JST

- 変更内容: 登録・ログイン、グループ作成・参加、記録入力・共有・個人履歴の画面を接続した。ユーザーの追加指定により、初版をホーム画面に追加するオンラインWebアプリとし、manifest・PNGアイコン・Apple用設定・安全領域・入力文字サイズを追加した。
- 目的: 仲間と実記録を保存・共有でき、スマートフォンから継続利用する入口を整える。
- 影響範囲: frontendの画面・Auth／APIクライアント・下書き保持・ブラウザテスト、初版の利用形態と手順。
- 関連ファイル: frontend/src/、frontend/tests/、frontend/playwright.config.ts、docs/standard-v0.1-scope.md、task.md、README.md。
- テスト方針: 下書きと入力制約の単体テスト、2ブラウザの共有E2Eを追加した。画面全体は実Auth・DBとの接続が必要なため先に接続し、その後でE2Eを記述した。ホーム画面設定は先に未実装importの失敗を確認してから実装し、単体テスト4件が成功した。
- 確認結果: ホーム画面設定追加前のmake checkはbackend23件・frontend3件・lint・buildが成功。E2EでNext.js開発表示によるボタン遮蔽と通知セレクターの曖昧さを検出して修正した。再実行では認証サービスへの一時的な接続失敗を画面表示し、入力下書きが保持されることを確認したが、共有フロー全体の成功はまだ確認中。
- 未解決事項: 最終E2Eとホーム画面メタ情報の配信確認が残る。HTTPS公開・実機からの追加操作・キーボード表示・起動復帰は未実施。オフライン保存同期・Push通知・ネイティブ配布は今回含めない。
- 次のアクション: 残る検証を終え、環境・CI・READMEの整合とコミットを仕上げる。

## 2026-09-07 02:09 JST

- 変更内容: 記録・共有画面とホーム画面起動の設定を仕上げた。Apple用アイコンの参照タグを明示し、現在のNext.jsが出力するmobile-web-app-capableとApple用タイトルを検証した。中断後の自分のテストサーバーだけを再利用するオプションを追加した（CIでは無効）。
- 目的: 「グループ作成→参加→記録→共有→再ログイン」の実利用フローと、ホーム画面用設定の配信を完成させる。
- 影響範囲: frontendの画面・設定・テスト、初版の仕様・完了状態。DBの保存・認可ルールは維持した。
- 関連ファイル: frontend/、.gitignore、docs/standard-v0.1-scope.md、task.md。関連Issue: #1。
- 確認結果: 最終make check成功（backend23件、frontend単体4件、Ruff・Biome、本番build）。実ブラウザE2E2件成功（ホーム画面のmanifest・メタ情報・192／512／180px PNG、2人の登録・グループ作成／参加・共有・下書き復元・通信失敗後の再送・再ログイン）。390px幅の共有記録画面を目視確認し、横はみ出しなしを自動検証した。
- 検証上の補足: 前回の認証障害はDocker内のDBホスト名解決タイムアウトとログで確認した。中断後に残った応答しない一時Web・APIのみ停止・再起動して検証を完了した。テスト終了後の一時APIも停止した。ローカルSupabaseとテストデータは保持し、他プロジェクトは変更していない。
- 未解決事項: 公開環境・実機でのホーム画面追加／再起動・キーボード操作、リモートCIは未実施。下書きは同じブラウザ内の補助保存で、オフライン同期はない。
- 次のアクション: 環境・CI・チーム文書をコミットし、レビュー後にHTTPS公開と実機確認のIssueを計画する。

## 2026-09-07 02:11 JST

- 変更内容: READMEを実装済みの起動・操作・検証手順へ更新した。既存ファイルを上書きせず秘密値も表示しないローカル環境生成コマンド、frontend単体／E2EのMakeターゲット、専用DBでのCIテスト、Supabase CLIの固定、Composeの接続設定を整備した。AGENTS・CONTRIBUTING・現状・開発方針も実装状態に揃えた。
- 目的: 複数人が同じ手順で記録共有を起動・検証し、現行システムを基に週次Issueを選べるようにする。
- 影響範囲: 開発環境・CI定義・手順。公開サービスへのデプロイやGitHubの保護設定変更は行っていない。
- 関連ファイル: README.md、AGENTS.md、CONTRIBUTING.md、Makefile、docker-compose.yml、scripts/configure_local.py、.github/workflows/ci.yml、docs/current-state.md、docs/development-policy.md。
- 確認結果: 環境生成コマンドの既存ファイル保持、Compose構文、文書のローカルリンク24件、CI YAML、Supabase設定、git diff --checkを確認。最終make check・E2Eの成功は前項の通り。失敗時traceをlintが読み込む問題は生成物の除外で解消した。
- テスト方針: 起動補助スクリプト・CI・文書は既存手順との結合が主体のため、新しい失敗テストを先行せず、実行結果・設定の構造・秘密値を出さない既存ファイル保持動作で確認した。
- 未解決事項: リモートCI、Docker Composeでのアプリ実起動、HTTPS公開・実機確認は未実施。GitHub main保護・実装者以外のレビューはチーム側で行う。元から未追跡のPDF2点・参考画像1点は変更・コミットしていない。
- 次のアクション: ローカルコミットをレビューし、公開環境の接続先と運用を決めて実機確認へ進む。初版を使った改善は週次計画と後続Issueで選ぶ。

## 2026-09-07 02:12 JST

- 変更内容: ユーザーのローカル実行依頼により、既存のGO TORE専用Supabaseと環境ファイルを使い、make backend（8000番）とmake frontend（3000番）を起動した。
- 目的: ユーザーがPCのブラウザで初版を操作できるようにする。
- 影響範囲: ローカル開発プロセスのみ。既存DB・設定は変更せず、他プロジェクトも停止していない。
- 関連ファイル: Makefile、README.md、progress.md。Next.jsの起動でnext-env.d.tsの型参照がdev用に自動更新されるが、生成差分はコミットしない。
- 確認結果: Web画面、APIのhealth、Web経由のhealthが正常応答した。機能の変更はないためテスト追加・全テスト再実行はしていない。
- 未解決事項: スマートフォン実機からの利用には別途到達可能なHTTPS・Auth設定が必要。
- 次のアクション: http://localhost:3000 で新規登録し、グループ作成・記録共有を試す。
