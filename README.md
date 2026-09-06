# GO TORE

離れていても仲間と合トレしている感覚を目指す、トレーニングアプリです。
中心となる体験は「仲間の頑張りを見る → 自分の記録を共有する → 評価・反応を受け取る → 次のトレーニングにつなげる」です。

現在はNext.jsとFastAPIの開発基盤まで実装済みで、GO TORE固有の機能はこれから作ります。
必要な機能を小さく完成させ、開発メンバー自身で使いながら、毎週Issueを選んで追加・修正します。
将来はAndroid／iOSへの移植を想定しています。モバイルの実装方式は未決定です。

## 最初に読むもの

| 資料 | 内容 |
| --- | --- |
| [docs/README.md](docs/README.md) | 仕様・発表資料の一覧と適用範囲 |
| [docs/current-state.md](docs/current-state.md) | 実装済みの機能、未実装、判断が必要な差分 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Issue・週次計画・ブランチ・PR・検証の進め方 |
| [docs/development-policy.md](docs/development-policy.md) | 段階的な実装とモバイル移植に向けた設計方針 |
| [AGENTS.md](AGENTS.md) | エージェントが作業するときの規約 |
| [task.md](task.md) / [progress.md](progress.md) | 大きなタスク / 日時付きの変更履歴 |

## 開発環境

バージョンはリポジトリ内の定義を基準にします。

| 対象 | 使用するもの・定義 |
| --- | --- |
| Web | Next.js App Router / React / TypeScript、[frontend/package.json](frontend/package.json)・[bun.lock](frontend/bun.lock) |
| API | FastAPI、[backend/pyproject.toml](backend/pyproject.toml)・[uv.lock](backend/uv.lock) |
| Python | 3.12系、[backend/.python-version](backend/.python-version) |
| Python環境管理 | uv |
| JavaScript環境管理 | Bun 1.3.9、packageManager・Dockerfile・CIで指定 |
| ローカルDB基盤 | Supabase CLI + Docker。アプリとの接続・テーブルは未実装 |
| 共通操作 | Git / GNU Make。WindowsではWSL2内からの実行を想定 |

## ローカルで開発する

Git、GNU Make、Python 3.12、uv、Bun 1.3.9を用意し、このリポジトリをcloneしてルートへ移動します。
WebとAPIの初期画面の起動にはDBや外部サービスのアカウントは不要です。

```bash
make install
```

初回のみ、環境変数のサンプルをコピーします。既存ファイルがある場合は上書きせず内容を確認してください。

```bash
cp -n backend/.env.example backend/.env
cp -n frontend/.env.example frontend/.env.local
```

別々のターミナルで起動します。

```bash
# ターミナル1
make backend
```

```bash
# ターミナル2
make frontend
```

| 確認先 | 期待する状態 |
| --- | --- |
| http://localhost:3000 | 開発基盤のトップページとBackend Healthの `ok` 表示 |
| http://localhost:8000/api/health | `status` が `ok` のJSON |
| http://localhost:8000/docs | APIを試せるSwagger UI |
| http://localhost:8000/openapi.json | 現在のAPI定義 |

画面・APIの表示名にはまだ `Web App Standard` が残っています。アプリ画面の実装は後続Issueで扱います。
停止は各ターミナルで `Ctrl+C` を押します。

## Dockerで起動を確認する

DockerとDocker Composeを使う場合は、ルートで以下を実行します。

```bash
docker compose up --build
```

確認先はローカル起動と同じです。停止は別ターミナルから実行できます。

```bash
docker compose down
```

Composeで起動するのはfrontendとbackendです。Supabaseは含みません。
現行Composeにはソースのボリュームマウントがないため、変更を反映するには再ビルドが必要です。
日常の編集には上のローカル個別起動を使えます。両方の起動方法を同時に使うと3000／8000番ポートが競合します。

## 検証コマンド

```bash
make check
```

backendのlint・テスト、frontendのlint・buildを実行します。

| コマンド | 内容 |
| --- | --- |
| `make install` | lockfileに従ってbackendとfrontendの開発依存をインストール |
| `make lint` | RuffとBiomeで検査 |
| `make test-backend` | pytestを実行 |
| `make build-frontend` | Next.jsをビルド |
| `make check` | 上記のlint・テスト・buildをまとめて実行 |

現在の動作テストはbackendのヘルスチェック1件です。frontendの動作テスト・E2Eは未導入です。
機能を追加するIssueでは、その動作を確かめるテストも用意します。
GitHub ActionsはPRと`main`へのpush時に、これらの検証に加えてSupabaseのmigration適用・schemaのlintを実行します。

## DBを扱う場合

現在のSupabaseはローカルDBとmigrationの土台です。アプリ固有のSQLや接続処理はありません。
発表用MOCK資料ではNeonが指定されているため、採用範囲は [現状の差分](docs/current-state.md) で管理します。

```bash
make db-start
make db-new name=create_example_table
make db-lint
make db-stop
```

`make db-new` は変更が必要な場合だけ実行し、生成されたSQLを編集します。
適用検証に使う `make db-reset` は、ローカルDBのデータを削除してmigration・seedから再作成します。
共有環境や本番への反映はこのセットアップに含みません。

現行の `make db-*` は `bunx supabase`、CIは `supabase/setup-cli` の `latest` を使い、CLIのバージョンはまだ固定していません。
DB方針を決めた後に、バージョン統一を環境整備Issueとして扱います。

## 配置先

```text
frontend/src/app/           ページ・ルーティング
frontend/src/components/    共通UI
frontend/src/features/      機能ごとのUI・処理
frontend/src/lib/           APIクライアント・共通処理
backend/app/api/            HTTPの入口
backend/app/schemas/        APIの入力・出力型
backend/app/domain/         業務ルール
backend/app/services/       ユースケース
backend/app/infrastructure/ DB・外部サービス連携
backend/tests/             backendのテスト
frontend/tests/            frontendテストの配置予定先
supabase/                  ローカルDB設定・migration・seed
docs/                      仕様・設計・参考資料
.github/                   CI・Issue・PRテンプレート
```

## うまく起動しない場合

- Backend Healthが表示されない: backendの起動ログと `/api/health` を確認します。ローカルの `BACKEND_INTERNAL_URL` は `http://localhost:8000`、Compose内は `http://backend:8000` です。
- ポートが使用中: 同じアプリのローカル起動とDocker起動が重複していないか確認します。
- lockfile不整合: 依存定義とlockfileが同じコミットのものか確認します。通常のセットアップでlockfileを削除・再生成しません。
- Supabaseが起動しない: Dockerの起動状態と54320番台のポートの使用状況を確認します。

今週作るものは [週次計画Issue](.github/ISSUE_TEMPLATE/weekly.md) で選びます。
初回のGitHub設定とレビュー手順は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。
