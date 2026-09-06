# GO TORE

離れていても仲間と合トレしている感覚を目指す、トレーニングアプリです。
初版は「グループを作る → 記録する → 仲間に共有する」までを実装しています。
日付・種目・重量・回数・セットを保存し、自分の記録とグループの記録を閲覧できます。
利用形態は、Webページをスマートフォンのホーム画面に追加するオンラインのWebアプリです。

必要な機能を小さく完成させ、実際に使って毎週改善します。将来のAndroid／iOS移植に向けて、業務処理をAPI側に分離しています。

## 最初に読むもの

| 資料 | 内容 |
| --- | --- |
| [初版の仕様](docs/standard-v0.1-scope.md) | 今回の範囲、保存・共有のルール、API、完了条件 |
| [資料一覧](docs/README.md) | PDF・参考画面と仕様の適用範囲 |
| [現状](docs/current-state.md) | 実装済み・残作業 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Issue・週次計画・PR・レビューの進め方 |
| [AGENTS.md](AGENTS.md) | エージェントの作業規約 |
| [開発方針](docs/development-policy.md) | 責務の配置とモバイル移植の方針 |
| [task.md](task.md) / [progress.md](progress.md) | 大きなタスク / 変更・検証の記録 |

実装Issue: [#1 グループ作成・記録・共有](https://github.com/ezofroger-in-hokudai/gotore/issues/1)

## 開発環境

- Git、GNU Make、Python 3.12系、uv、Bun 1.3.9、Docker／Docker Compose。
- WindowsではWSL2内からの実行を想定。
- WebはNext.js／TypeScript、APIはFastAPI、認証とDBはローカルSupabase。
- 依存の詳細は [frontend/package.json](frontend/package.json) と [backend/pyproject.toml](backend/pyproject.toml)、各lockfileを基準にします。
- Supabase CLIはローカル・CIとも2.107.0に固定しています。MakefileからBun経由で呼び出します。

## 初回セットアップ

clone後、リポジトリのルートで実行します。Dockerを起動しておいてください。

```bash
make install
make db-start
make env-local
```

`db-start` はGO TORE専用のSupabase（プロジェクトID: `gotore`）を起動し、初回はmigrationを適用します。
DB・認証の基本動作をローカルで試すために、クラウドサービスのアカウントは不要です。

`env-local` は起動済みのローカルSupabaseから接続情報を読み、`backend/.env` と `frontend/.env.local` を作成します。
秘密の値は表示せず、既存ファイルは上書きしません。既存のサンプルをコピー済みの場合は、各 `.env.example` と `bunx supabase@2.107.0 status` を参照して手動で設定してください。

別々のターミナルで起動します。

```bash
# ターミナル1
make backend
```

```bash
# ターミナル2
make frontend
```

| 確認先 | 用途 |
| --- | --- |
| http://localhost:3000 | GO TOREの登録・ログイン画面 |
| http://localhost:8000/docs | API仕様・Swagger UI |
| http://localhost:8000/openapi.json | API定義 |
| http://localhost:8000/api/health | ヘルスチェック |
| http://localhost:59323 | Supabase Studio（通常のdb-start時） |
| http://localhost:59324 | ローカルの確認メール |

ローカル設定はメール確認なしで登録できます。公開環境ではメール確認・メール送信・公開URLを別途設定します。

## 最初に試す操作

1. アカウントAを登録し、「グループ」からグループを作成する。
2. 招待コードをコピーし、別ブラウザでアカウントBを登録してコードで参加する。
3. Aで「トレーニングを記録」を開き、共有先・種目・重量・回数を入力する。
4. 「記録を確定して共有」で保存する。
5. BのホームでAの記録を確認する。表示中は5秒ごとに更新する。
6. Aの「自分の記録」で保存内容を確認する。再ログインしても履歴は残る。

同じブラウザの別タブはログイン状態を共有するため、2人分の確認には別ブラウザか別プロファイルを使ってください。
共有先を「自分だけの記録」にすると、仲間には公開されません。

## スマートフォンのホーム画面から使う

ホーム画面用の名前・アイコンと、ブラウザの枠を外して起動する `standalone` 設定を用意しています。
公開後、端末からアクセスできるHTTPSのURLで追加してください。ストアへの配布は今回行いません。

- iPhone: SafariでURLを開く → 共有 →「ホーム画面に追加」→「Webアプリとして開く」をオンにして追加。[Appleの手順](https://support.apple.com/ja-jp/guide/iphone/iphea86e5236/ios)
- Android: ChromeでURLを開く → メニュー →「ホーム画面に追加」→「インストール」。表示名は端末・ブラウザによって異なります。[Googleの手順](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=ja)

追加したアイコンから起動し、ログインして使います。通常ブラウザとホーム画面のアプリでログインや下書きが共有されるとは限りません。
保存・共有・再起動にはオンライン接続が必要です。下書きは同じブラウザ／ホーム画面アプリ内の補助保存で、オフライン同期やバックアップではありません。

PCの `localhost` はスマートフォンから使うための公開URLではありません。
実機利用にはWebとAuthが端末から到達できるHTTPS環境、frontendの `NEXT_PUBLIC_SUPABASE_URL`、Authの許可URL・メール設定が必要です。
ローカルSupabaseの既定キーや管理画面をそのままインターネットへ公開しないでください。
公開環境の準備後、iPhone／Androidそれぞれで「追加 → 起動 → ログイン → 記録・共有 → 閉じて再起動」と、キーボード・画面端の表示を確認します。実機での追加操作は自動テストの対象外です。

## 検証

backendのDB統合テストには専用の `gotore_test` DBを使います。初回だけ作成してください。

```bash
docker exec supabase_db_gotore createdb -U postgres gotore_test
```

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:59322/gotore_test make check
```

`check` はbackendのlint・テスト、frontendのlint・単体テスト・buildを実行します。
`TEST_DATABASE_URL` が未指定ならDB統合テストはskipになります。CIでは専用PostgreSQLを必ず用意して実行します。
統合テストは名前が `_test` で終わるDBだけを使い、業務テーブルをトランザクション内で作成して終了時にロールバックします。

ブラウザでの結合確認:

```bash
cd frontend
bunx playwright install chromium
cd ..
make test-e2e
```

E2EはローカルSupabaseと設定済みの環境ファイルを使い、APIを8100番・Webを3100番で一時起動します。
中断後に自分が起動した同じテスト用サーバーが残っている場合だけ、`PLAYWRIGHT_REUSE_SERVER=1 make test-e2e` で再利用できます。別のアプリや通常開発用サーバーには使わないでください。CIでは再利用しません。
別ブラウザの登録・参加・共有、下書き復元、通信失敗後の再送、再ログインを確認します。
ホーム画面用のmanifest・メタ情報・各サイズのPNGアイコン配信も確認します。
ローカルDBに `gotore-…@example.test` のテストアカウントとその記録を作成します。既存ユーザーのデータは削除しません。
結果・失敗時の画像はGit対象外の `frontend/test-results/` に出力します。
失敗時のtraceにはテスト用の認証情報も含まれるため、生成物はコミットせず、lintの対象からも除外しています。

| コマンド | 内容 |
| --- | --- |
| `make install` | lockfileに従って開発依存を準備 |
| `make env-local` | 未作成のローカル環境ファイルを準備 |
| `make lint` | Ruff・Biome |
| `make test-backend` | pytest（DB統合はTEST_DATABASE_URLが必要） |
| `make test-frontend` | 入力・下書きの単体テスト |
| `make test-e2e` | 実ブラウザ2人分の結合テスト |
| `make build-frontend` | Next.jsのビルド |
| `make check` | lint・backendテスト・frontend単体テスト・build |
| `make db-lint` | ローカルDBのschema検査 |

GitHub Actionsではbackend、frontend、databaseの3ジョブで、DB統合テスト・migration適用・E2Eを含む確認を行います。

## DockerでWeb・APIを動かす場合

上の `make db-start` と `make env-local` を先に済ませてから実行します。

```bash
docker compose up --build
```

Webは3000番、APIは8000番です。Supabaseは別起動で、コンテナのAPIからは `host.docker.internal:59321` と `59322` へ接続します。
ソースのボリュームマウントはないため、変更時は再ビルドしてください。日常の編集はローカル個別起動を使えます。

停止は `docker compose down`、Supabaseの停止は `make db-stop` です。
`make db-reset` はローカルDBのデータを削除してmigration・seedから再作成します。既存データを残したい場合は実行しないでください。

## 主な配置先

| 場所 | 役割 |
| --- | --- |
| `frontend/src/features/training/` | ログイン・グループ・記録・共有画面 |
| `frontend/src/lib/` | APIクライアント、Supabase Authクライアント |
| `backend/app/api/` | HTTP、認証済みユーザーの取得 |
| `backend/app/domain/` | 入力・業務制約 |
| `backend/app/services/` | 本人の操作を組み立てる処理 |
| `backend/app/infrastructure/` | DB操作・トランザクション |
| `backend/app/schemas/` | APIの入出力 |
| `supabase/migrations/` | schemaとDB制約 |
| `backend/tests/` / `frontend/tests/` | テスト |
| `scripts/configure_local.py` | ローカル環境ファイルの準備 |

## 起動できない場合

- ログインの準備ができていない: `make db-start` と `make env-local` を確認し、Webを再起動します。
- APIが503になる: backendのDB接続先・Supabase URL・anon keyを確認します。
- ポートが競合する: Webの3000、APIの8000、Supabaseの59320番台が他で使われていないか確認します。
- lockfile不整合: 依存定義とlockfileを同じコミットに合わせます。通常のセットアップでlockfileを削除しません。
- 共有記録が見えない: 同じグループに参加しているか、保存時にそのグループを選んだか確認します。

SCORE・AI・ランキング・スタンプ・編集削除・グループ管理・公開環境・ネイティブモバイルアプリは後続です。
今週の追加・改善は [週次計画テンプレート](.github/ISSUE_TEMPLATE/weekly.md) で選びます。
