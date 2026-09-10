# GO TORE

離れていても仲間と合トレしている感覚を目指す、トレーニングアプリです。
初版は「作成 → 記録する → 仲間に共有する」までを実装しています。
自分で追加・削除できる種目リストから選び、日付・種目・重量・回数・セットを保存し、自分の記録とグループの記録を閲覧できます。
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

## 開発手順の目次

- [初回セットアップ](#初回セットアップ): 依存・Supabase・環境ファイル・起動・ログイン
- [日々の開発](#日々の開発): pull後の更新、停止、ブランチとPR
- [環境変数](#環境変数): ファイルの置き場所、値、変更後の反映
- [DBとmigration](#dbとmigration): 履歴確認、通常適用、新規作成、reset
- [検証](#検証): 単体・DB統合・E2E・CI
- [DockerでWeb・APIを動かす場合](#dockerでwebapiを動かす場合)
- [Vercel・Supabaseへ公開する場合](#vercelsupabaseへ公開する場合)
- [起動できない場合](#起動できない場合)

## 開発環境

- Git、GNU Make、Python 3.12系、uv、Bun 1.3.9、Docker／Docker Compose。
- WindowsではWSL2内からの実行を想定。
- WebはNext.js／TypeScript、APIはFastAPI、認証とDBはローカルSupabase。
- 依存の詳細は [frontend/package.json](frontend/package.json) と [backend/pyproject.toml](backend/pyproject.toml)、各lockfileを基準にします。
- Supabase CLIはローカル・CIとも2.107.0に固定しています。MakefileからBun経由で呼び出します。

## 初回セットアップ

### 1. リポジトリとツールを準備する

```bash
git clone git@github.com:ezofroger-in-hokudai/gotore.git
cd gotore
```

以降、`cd` の指示がないコマンドはすべてリポジトリのルートで実行します。
SSHでcloneできない場合はGitHubへのSSH認証を設定するか、利用可能なHTTPSのclone URLを使います。

前項のツールを準備し、Docker DesktopまたはDocker Engineを起動します。
`docker info` が成功することを確認してください。Linuxでは実行ユーザーがDockerを利用できる必要があります。
初回は依存パッケージとコンテナイメージのダウンロードに時間がかかります。
このリポジトリでは `supabase init` は不要です。既存の `supabase/config.toml` を使います。

### 2. 依存・DB・環境ファイルを準備する

```bash
make install
make db-start
make env-local
```

`db-start` はGO TORE専用のSupabase（プロジェクトID: `gotore`）を起動し、初回はmigrationを適用します。
DB・認証の基本動作をローカルで試すために、クラウドサービスのアカウントは不要です。

`env-local` は起動済みのローカルSupabaseから接続情報を読み、`backend/.env` と `frontend/.env.local` を作成します。
秘密の値は表示せず、既存ファイルは上書きしません。既存のサンプルをコピー済みの場合や値を変える場合は、[環境変数](#環境変数)の手順で手動更新してください。

### 3. API・Webを起動する

別々のターミナルで、どちらもリポジトリルートから起動します。

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
| http://localhost:3000 | GO TOREのログイン画面 |
| http://localhost:8000/docs | API仕様・Swagger UI |
| http://localhost:8000/openapi.json | API定義 |
| http://localhost:8000/api/health | ヘルスチェック |
| http://localhost:59323 | Supabase Studio（通常のdb-start時） |
| http://localhost:59324 | ローカルの確認メール |

`/api/health` が200でも、AuthやDBへの接続成功までは確認できません。次のログインと記録保存まで試します。

### 4. ローカルのログイン用アカウントを作る

Supabase StudioのAuthentication → Users → Add user → Create new userで、開発用のメール・パスワードを設定し、Auto Confirm Userをオンにします。seedは空なので、初回起動だけではログイン用ユーザーや記録は作られません。

ローカル・公開環境とも一般ユーザーの新規登録は提供しません。詳細は [管理者登録ガイド](docs/admin-managed-accounts.md) を参照してください。アカウントを作成できたら [最初に試す操作](#最初に試す操作) でログインから記録共有まで確認します。

## 日々の開発

### pull後・作業を再開するとき

未コミット変更を確認してから、作業対象のブランチで実行します。migration SQLもPRで確認してください。

```bash
git status --short
git pull --ff-only
make install
make db-start
make env-local
make db-migrations
make db-migrate
```

`make install` は既存のlockfileに合わせます。`make env-local` は未作成のファイルだけを補い、追加された変数を既存ファイルへ自動追記しません。PRの環境変数変更とサンプルの差分を確認し、必要な値を手動で反映します。
`make db-migrate` は未適用migrationを実行します。適用済みなら変更はありません。SQL自体にデータ変更があればその影響は発生します。
その後、別ターミナルで `make backend` と `make frontend` を起動します。起動済みなら必要に応じて再起動してください。

`supabase/config.toml` のAuth設定などが変わった場合は、`make db-stop` → `make db-start` で反映します。`make db-migrate` はAuthのサービス設定を反映する操作ではありません。

### 作業を終えるとき

Web・APIの各ターミナルで `Ctrl+C`、続けて `make db-stop` を実行します。通常のstopはローカルデータを保持します。次回は `make db-start` で再開できます。

### IssueからPRまで

週次計画からIssueを選び、現状・受け入れ条件・担当・依存関係を確認します。作業ツリーを整理した状態でブランチを作ります。

```bash
git switch main
git pull --ff-only
git switch -c feat/123-workout-record
```

`123` とブランチ名は対象Issueに置き換えます。関連する `docs/`・`task.md`・`progress.md` とコード・テストを読み、仕様とテストを更新して小さく実装します。
[検証](#検証)を済ませ、`progress.md` に変更意図・結果・未実施項目を記録します。
変更したファイルを個別に `git add` してコミットし、`git push -u origin HEAD` で共有します。`main` 宛てにPRを作成し、関連Issue・migrationと環境変数の有無・検証結果を記載します。
CI成功と原則として実装者以外のレビューを経てマージします。詳しい運用は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## 環境変数

### ファイルの置き場所と読み込み先

| ファイル | 作成・更新方法 | 読むプロセス |
| --- | --- | --- |
| `backend/.env` | `make env-local`、または [backend/.env.example](backend/.env.example) から手動設定 | `make backend` で起動するFastAPI（作業ディレクトリの `.env` を読む） |
| `frontend/.env.local` | `make env-local`、または [frontend/.env.example](frontend/.env.example) から手動設定 | `make frontend` / buildで起動するNext.js |
| [.env.vercel.example](.env.vercel.example) | Vercelの対象環境へ値を登録するための一覧 | サンプル自体を読むプロセスはない |

ルートに `.env` を1つ置くだけでは、上記の通常起動には設定されません。実ファイルはGit対象外です。サンプルの `replace-with-…` は実際のキーに置き換えます。

通常は `make db-start` → `make env-local` だけでローカルの値がそろいます。生成ファイルの権限は所有者だけが読み書きできる `0600` です。スクリプトはloopbackの接続先のみを受け付け、既存ファイルの内容・権限を変更しません。
手動で用意するときだけ、未作成のファイルをコピーします。

```bash
cp -n backend/.env.example backend/.env
cp -n frontend/.env.example frontend/.env.local
chmod 600 backend/.env frontend/.env.local
```

`bunx supabase@2.107.0 status` のAPI URL・DB URL・anon keyを対応する項目へ設定します。statusには管理キーなども表示されるため、その出力全体をIssue・チャットへ貼らないでください。通常のアプリにservice_roleやSecret Keyは設定しません。

### 値の一覧

| 変数 | 設定先 | 用途・ローカルの値 |
| --- | --- | --- |
| `DATABASE_URL` | backend | API用DB接続。標準は `postgresql://postgres:postgres@127.0.0.1:59322/postgres`。パスワードを含む秘密値 |
| `DATABASE_POOL_MAX_SIZE` | backend | 省略時4、0〜10。プロセスごとのDB接続上限。0なら毎回接続する方式へ戻す。変更後はAPIを再起動する |
| `SUPABASE_URL` | backend | APIが本人確認に使うAuthのURL。標準は `http://127.0.0.1:59321` |
| `SUPABASE_ANON_KEY` | backend | 同じローカルSupabaseのanon key。クラウドではPublishable Keyまたはanon key |
| `NEXT_PUBLIC_SUPABASE_URL` | frontend | ブラウザが接続するAuthのURL。ローカルでは上のURLと同じ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | frontend | 同じプロジェクトの公開キー。上のanon keyと同じ |
| `BACKEND_INTERNAL_URL` | frontend | Next.jsサーバーからAPIへの転送先。通常は `http://localhost:8000`。Vercelでは不要 |
| `APP_NAME` / `APP_VERSION` / `APP_ENV` | backend・任意 | APIの表示情報。既定は `GO TORE API` / `0.1.0` / `development` |
| `APP_HOST` / `APP_PORT` | backend・任意 | 設定項目はあるが、起動ポートはMakefileのuvicorn引数で指定。ここだけ変えても待受先は変わらない |
| `TEST_DATABASE_URL` | テスト実行時の環境変数 | `_test` で終わる専用DB。[検証](#検証)のコマンドで渡す。backend/.envに追記しない |

`NEXT_PUBLIC_` はブラウザに公開されます。DB接続文字列・管理キーを入れません。現在のコードは `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` という変数名を読まないため、Publishable Keyも表の `…ANON_KEY` に設定します。
シェルや実行環境に設定した同名変数はファイルより優先されます。接続先が意図と違う場合は、以前 `export` した値やIDEの起動設定も確認してください。

### 値を変更したとき・追加したとき

- backendの `.env`: APIを再起動する。起動時に設定を読み込むため、ファイル保存だけでの反映に頼らない。
- frontendの `.env.local`: Next.jsを再起動する。`NEXT_PUBLIC_` の値は本番ビルドに埋め込まれるので、配布用には再ビルドする。
- Vercel: Production／Previewなど対象環境へ登録し、変更後に再デプロイする。[公開準備ガイド](docs/vercel-supabase.md)を参照する。
- 新しい変数を実装で使う場合: 対象のサンプルとこの表を同じPRで更新し、必須／任意・既定値・公開してよい値かを記載する。自動生成に必要なら `scripts/configure_local.py` も更新する。

## DBとmigration

DBの構造は [supabase/migrations/](supabase/migrations/) のSQLで管理します。API起動・`make install`・Vercelのbuildはmigrationを適用しません。

| 操作 | コマンド | データへの影響 |
| --- | --- | --- |
| 初回起動・再開 | `make db-start` | 初回はmigration・seedで構築。既存DBの更新は下記の通常適用を実行 |
| ファイルとローカルDBの適用履歴を比較 | `make db-migrations` | 読み取りのみ |
| 通常の更新 | `make db-migrate` | 未適用SQLを実行。DB全体の作り直しはしない |
| migrationの新規作成 | `make db-new name=add_example_column` | SQLファイルを作るだけ。名前は変更内容に置き換える |
| schema検査 | `make db-lint` | ローカルDBを検査 |
| 作り直しの検証 | `make db-reset` | **ローカルDBのアカウント・記録を削除**し、migration・seedから再構築 |

通常のpull後は `make db-migrations` → `make db-migrate` を使います。Makefileの履歴確認・適用・resetは `--local` を指定しています。接続先はSupabase CLIのローカル設定で決まり、backendの `DATABASE_URL` では切り替わりません。

DBを変更する場合は、最新mainを取り込み、新しいmigrationファイルへSQLを書き、既存データへの追加適用と、失ってよいローカルDBでの全件再構築の両方を検証します。適用・共有済みファイルは書き換えず、修正用のmigrationを追加します。制約・RLS・既存データの移行もPRに含めます。

`make db-reset` は日常の更新には使いません。現在の `seed.sql` は空で、reset後のユーザーと記録は復元されません。手動アカウントは再作成が必要です。
ブランチやworktreeを切り替えてもDBは巻き戻らず、同じ `project_id = "gotore"` とポートではローカルDBを共有します。別ブランチで適用したmigrationが残っている場合は、そのままresetや履歴修正をせず、使用中のデータとブランチの関係を確認してください。

具体的な作成・検証・共有DBへの適用手順、履歴のずれへの対処は [supabase/README.md](supabase/README.md) を参照してください。クラウドのmigrationは担当者が対象環境と反映順序を確認して行います。現在のCIは一時DBで検証し、Production／PreviewのDBへは自動適用しません。

## 最初に試す操作

1. 管理者が発行したアカウントAでログインし、「グループ」からグループを作成する。
2. 招待コードをコピーし、別ブラウザで管理者発行のアカウントBでログインしてコードで参加する。
3. Aで「記録する」を開き、共有先・種目を選び、重量・回数を入力する。候補にない種目は「種目リスト」で追加する。
4. 「記録を確定して共有」で保存する。
5. BのホームでAの記録を確認する。表示中は5秒ごとに更新する。
6. Aの「自分の記録」で保存内容を確認する。月別ヒートマップの日付をタップすると、その日の記録に絞り込める。再ログインしても履歴は残る。

活動カレンダーの色は日ごとの合計セット数を示します。仕様は [活動ヒートマップ](docs/activity-heatmap.md) を参照してください。

種目リストは本人専用です。初回の8候補も削除でき、リストから削除しても過去記録と下書きは残ります。仕様と公開前の追加migrationは [種目リストの仕様](docs/exercise-options.md) を参照してください。

追加操作: 「設定」で保存できます。グループのオーナーは「グループ」画面で名称を変更できます。
記録入力ではEnterで次の欄・セットへ進みます。追加した重量欄は空欄で、薄く表示された前セットの重量は空欄でEnterを押したときだけ採用します。異なる重量はそのまま入力してください。仕様・未対応範囲は [日常操作の改善](docs/daily-improvements.md) を参照してください。

同じブラウザの別タブはログイン状態を共有するため、2人分の確認には別ブラウザか別プロファイルを使ってください。
共有先を「自分だけ」にすると、仲間には公開されません。

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

### lint・単体テスト・DB統合テスト

先に `make install` と `make db-start` を済ませます。
backendのDB統合テストにはアプリ用の `postgres` DBと別の `gotore_test` DBを使います。初回だけ作成してください。すでに存在する場合は作成を省略します。

```bash
docker exec supabase_db_gotore createdb -U postgres gotore_test
```

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:59322/gotore_test make check
```

`check` はbackendのlint・テスト、frontendのlint・単体テスト・buildを実行します。
`TEST_DATABASE_URL` が未指定ならDB統合テストはskipになります。CIでは専用PostgreSQLを必ず用意して実行します。
統合テストは名前が `_test` で終わるDBだけを使い、業務テーブルをトランザクション内で作成して終了時にロールバックします。

### ブラウザでの結合確認（E2E）

先に `make db-start`・`make env-local`・`make db-migrate` を済ませ、通常の `make frontend` を終了します。同じfrontendディレクトリでNext.js開発サーバーを同時起動すると起動ロックが競合します。

```bash
cd frontend
bunx playwright install chromium
cd ..
make test-e2e
```

LinuxでブラウザのOS依存が不足する場合は `frontend/` で `bunx playwright install --with-deps chromium` を実行します（OSパッケージ導入の権限が必要）。

E2EはローカルSupabaseと設定済みの環境ファイルを使い、APIを8100番・Webを3100番で一時起動します。
中断後に自分が起動した同じテスト用サーバーが残っている場合だけ、`PLAYWRIGHT_REUSE_SERVER=1 make test-e2e` で再利用できます。別のアプリや通常開発用サーバーには使わないでください。CIでは再利用しません。
一般登録の拒否とログイン専用UI、管理者作成ユーザーの別ブラウザでのログイン・参加・共有、下書き復元、通信失敗後の再送、再ログインを確認します。
ホーム画面用のmanifest・メタ情報・各サイズのPNGアイコン配信も確認します。
ローカルDBに `gotore-…@example.test` のテストアカウントとその記録を作成します。既存ユーザーのデータは削除しません。
結果・失敗時の画像はGit対象外の `frontend/test-results/` に出力します。
失敗時のtraceにはテスト用の認証情報も含まれるため、生成物はコミットせず、lintの対象からも除外しています。

### コマンド一覧とCI

| コマンド | 内容 |
| --- | --- |
| `make install` | lockfileに従って開発依存を準備 |
| `make env-local` | 未作成のローカル環境ファイルを準備 |
| `make lint` | Ruff・Biome |
| `make test-backend` | pytest（DB統合はTEST_DATABASE_URLが必要） |
| `make typecheck-frontend` | Next.jsのルート型を生成し、Web・単体テスト・E2EのTypeScriptを検査 |
| `make test-frontend` | 入力・下書きの単体テスト |
| `make test-e2e` | 実ブラウザ2人分の結合テスト |
| `make build-frontend` | Next.jsのビルド |
| `make check` | lint・frontend型検査・backendテスト・frontend単体テスト・build |
| `make db-lint` | ローカルDBのschema検査 |

GitHub Actionsではbackend、frontend、databaseの3ジョブで、DB統合テスト・migration適用・E2Eを含む確認を行います。databaseジョブのresetはCI用の一時Supabaseに対するものです。
文書・サンプルコメントだけの変更では、リンク・記載したコマンド・`git diff --check` を確認します。未実施・skip・失敗は成功と区別して `progress.md` とPRへ記録してください。

## DockerでWeb・APIを動かす場合

上の `make db-start`・`make env-local`・`make db-migrate` を先に済ませ、通常起動のWeb・APIを終了してから実行します（3000／8000番の競合を避けるため）。

```bash
docker compose up --build
```

Webは3000番、APIは8000番です。Supabaseは別起動で、コンテナのAPIからは `host.docker.internal:59321` と `59322` へ接続します。
ソースのボリュームマウントはないため、変更時は再ビルドしてください。日常の編集はローカル個別起動を使えます。

停止は `docker compose down`、Supabaseの停止は `make db-stop` です。
`make db-reset` はローカルDBのデータを削除してmigration・seedから再作成します。既存データを残したい場合は実行しないでください。

## Vercel・Supabaseへ公開する場合

ルートの [vercel.json](vercel.json) で、Next.jsとFastAPIをVercel Services（Beta）の1プロジェクトにまとめています。
VercelのRoot Directoryはリポジトリのルート（`.`）です。`frontend` や `backend` を個別に選びません。
各サービスのFramework・buildは設定ファイルで指定し、`/api/*` をFastAPI、それ以外をNext.jsへ送ります。

設定する値は [.env.vercel.example](.env.vercel.example)、具体的な手順・注意点は [公開準備ガイド](docs/vercel-supabase.md) を参照してください。
クラウドの環境変数・DB migration・Auth設定は別途必要です。テスト運用はログイン専用とし、[管理者登録ガイド](docs/admin-managed-accounts.md) に従ってアカウントを発行してください。画面変更だけでは一般登録は止まらないため、公開Supabase側の登録禁止設定も必要です。
ローカルの環境ファイルは公開用の値で上書きしません。migrationの反映は [共有DBへの適用手順](supabase/README.md#共有dbへの適用担当者向け) に従い、アプリのデプロイとは別に管理します。

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

| 症状 | 確認・対処 |
| --- | --- |
| Dockerへ接続できない / db-startが失敗 | Dockerを起動して `docker info` を確認。利用権限・空き容量・59320番台の競合を確認する |
| env-localで「既存ファイルを保持」と出る | 正常な動作。サンプルをコピー済みならプレースホルダーを手動更新する。再実行では上書きされない |
| ログインの準備ができていない / 認証失敗 | Webの環境変数を設定して再起動。フロント・APIで同じSupabaseのURLと公開キーを使い、確認済みアカウントを用意する |
| APIが503になる | backendのDB接続先・Supabase URL・公開キーを確認し再起動。healthの200だけではDB・Authの成功を判断しない |
| table/columnが存在しない | `make db-migrations` で履歴を確認し `make db-migrate`。接続先DBが想定どおりかも確認する |
| migration履歴・順序のエラー | [履歴のずれへの対処](supabase/README.md#履歴がずれているとき)で適用済みSQLとブランチを比較する。エラー回避だけのrepair・resetはしない |
| ポート・Next.jsの起動ロックが競合 | 通常用3000／8000とE2E用3100／8100を確認し、自分が起動した不要なサーバーを終了する |
| DB統合テストがskipされる | コマンド実行時に `TEST_DATABASE_URL` を渡す。backend/.envへの記載ではテストへ渡らない |
| E2Eが起動・ログインに失敗 | ローカルSupabase・ローカル用環境ファイル・Chromiumを準備し、通常のfrontendを終了。クラウド用の値では実行しない |
| lockfile不整合 | 依存定義とlockfileを同じコミットに合わせる。通常のセットアップでlockfileを削除しない |
| 仲間の共有記録が見えない | 同じグループへ参加しているか、保存時にそのグループを選んだか確認する |

SCORE・AI・ランキング・スタンプ・公開環境の運用・ネイティブモバイルアプリは後続です。
今週の追加・改善は [週次計画テンプレート](.github/ISSUE_TEMPLATE/weekly.md) で選びます。

TypeScriptの検査にはBunのテスト型も含めます。採用済みランタイムに合わせて開発依存の `@types/bun` を固定し、`make typecheck-frontend`（frontend内では `bun run typecheck`）をローカル・CIで実行します。生成済み `.next` がなくても先にルート型を生成し、検査結果のキャッシュファイルは残しません。[Bunの型定義](https://bun.com/docs/runtime/typescript)を参照。
