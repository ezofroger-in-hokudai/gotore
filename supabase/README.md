# DB・migrationの開発手順

初回起動と日々の更新は [ルートREADME](../README.md#dbとmigration) を参照してください。
この文書はDBを変更する開発者と、共有DBへ反映する担当者向けです。コマンドはリポジトリルートから実行します。
Supabase CLIはMakefile・CIと同じ `2.107.0` を使います。

## 管理するファイル

| ファイル | 役割 |
| --- | --- |
| [config.toml](config.toml) | ローカルSupabaseのサービス・ポート・Auth設定。クラウドのAuth設定には自動反映されない |
| [migrations/](migrations/) | 時刻付きのSQL。テーブル・制約・インデックス・RLSと、必要な既存データの移行を管理する |
| [seed.sql](seed.sql) | ローカルの初期データ。現在はコメントのみ。初回構築・resetで実行される |

DBスキーマはmigrationを正とし、Studioでの手作業だけで変更を終えません。アプリのユーザーはAuth経由で作り、`auth.users` へ直接INSERTしません。

## 新しいmigrationを作る

1. 対象Issueと仕様を確認し、最新mainを取り込む。既存データへの影響・権限・依存migrationを整理する。
2. `make db-start` → `make db-migrations` → `make db-migrate` で現在のブランチまで適用する。
3. 次のコマンドで空のSQLファイルを作る。名前は今回の変更内容へ置き換える。

```bash
make db-new name=add_example_column
```

生成された `supabase/migrations/<timestamp>_add_example_column.sql` にSQLを書きます。共有・適用済みファイルの時刻や内容は変えず、修正も新しいファイルで追加します。
既存行があるテーブルへNOT NULL列や一意制約を追加するときは、既存行をどう補完するかも含めて設計します。列の削除・名称変更では利用中のAPIとの互換性と反映順をPRに書きます。

## 追加適用と再構築を検証する

まず既存データのあるローカルDBで、新しいSQLを追加適用します。

```bash
make db-migrations
make db-migrate
make db-migrations
make db-lint
```

履歴一覧はファイルのバージョンと対象DBの適用済みバージョンの比較です。`--local` では比較相手もローカルDBです。
追加適用後に既存のアカウント・グループ・記録が意図どおり残ることと、新しい制約・権限を確認します。`make db-migrate` の再実行で未適用がないことも確認します。seedはこの操作では実行されません。

全件再構築は、データを失ってよいローカルSupabaseでだけ行います。resetするとアカウントと記録も消えるため、残したいデータがあるDBでは実行せず、使い捨て環境またはCIで検証します。

```bash
# このローカルDBのデータを削除してよいことを確認した場合だけ実行
make db-reset
make db-lint
```

専用の `_test` DBでの `make check` と、記録・共有に影響する場合の `make test-e2e` も実行します。準備・対象DBは [READMEの検証手順](../README.md#検証) に従います。reset後、手動ログイン用アカウントは [管理者登録ガイド](../docs/admin-managed-accounts.md#ローカル開発ci) に従って再作成します。

API・Web・SQL・必要なテストを同じ機能PRで共有し、以下を記載してください。

- 追加したmigrationと依存関係、既存データへの影響。
- 追加適用／全件再構築の結果と、制約・RLS・記録共有の確認結果。
- アプリとDBの反映順、失敗時の復旧方法、未実施の検証。

## 履歴がずれているとき

`git status` と `make db-migrations` で、チェックアウト中のファイルとローカルDBの履歴を比較します。
ブランチの切り替えはDBの巻き戻しではありません。同じproject ID `gotore` のworktreeは同じローカルDBを参照します。

- DBだけに存在するバージョン: 他ブランチの適用済みmigrationがないか調べる。元のブランチ・コミットとSQLを確認する。
- ファイルだけに存在するバージョン: 未適用なのか、過去の時刻へ差し込まれたSQLなのか、依存順を確認する。
- 適用途中で失敗した場合: エラー対象のSQLと実際のスキーマ・データ・履歴を確認し、必要な復旧を判断する。

`--include-all` や `migration repair` は通常手順に含めません。エラーを消す目的だけで履歴を編集すると、実際のスキーマとの不一致が残ります。repairはSQLを適用する操作ではありません。共有DBでは担当者と履歴・実データを確認してから復旧手順を決めます。
未共有・未適用のmigrationの順序調整と、共有済みmigrationの修正を区別し、チームが既に適用したファイルを勝手に改名しません。

## 共有DBへの適用（担当者向け）

以下はクラウドへ接続する操作で、日常のローカル起動には不要です。PRのレビュー・CI成功後、対象のSupabaseプロジェクト、Production／Previewの区別、バックアップ・復旧方法、アプリとの互換性を担当者が確認します。
共有DBへ適用するSQLを含むリリース対象コミットをチェックアウトし、**同じ対象への適用は1人ずつ**行います。

```bash
bunx supabase@2.107.0 login
# YOUR_PROJECT_REFを反映先のプロジェクト参照IDに置き換える
bunx supabase@2.107.0 link --project-ref YOUR_PROJECT_REF
bunx supabase@2.107.0 migration list --linked
bunx supabase@2.107.0 db push --linked --dry-run
```

ログイン情報やDBパスワードはCLIの案内に従って入力し、コマンド例やGitへ埋め込みません。リンク先を毎回確認し、適用一覧が意図したSQLだけであることを確認します。dry-runはSQLの実行検証ではありません。
既存のSQLをDashboardから手動適用していて履歴が一致しない場合は、ここで止めて実際のスキーマと突き合わせます。重複適用や無条件のrepairは行いません。

対象・SQL・反映順を確認できたら適用します。

```bash
bunx supabase@2.107.0 db push --linked
bunx supabase@2.107.0 migration list --linked
```

この手順はseedを共有DBへ投入しません。ローカルアカウント・記録も移行しません。リモートへ `db reset` は実行しません。
適用コミット・migration・対象環境・結果をPRまたは作業記録へ残し、[公開準備ガイド](../docs/vercel-supabase.md#検証と公開時チェック) に沿ってデプロイとログイン・記録共有を確認します。
既存APIと互換な追加migrationはAPIの更新より先に反映し、破壊的な変更は別途計画した順序で行います。アプリだけを戻してもDBは元に戻らないので、不具合時も履歴やデータを確認して復旧します。

現在の [CI](../.github/workflows/ci.yml) は一時的なPostgreSQL・Supabaseで検証します。クラウドDBへの自動適用は設定していません。Vercelのデプロイもmigrationを実行しません。

## 参照

CLI 2.107.0の `migration up`・`migration list`・`db push` のhelpと、以下の公式資料を確認しています（2026-09-08）。

- [Supabaseのmigration管理](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase CLIリファレンス](https://supabase.com/docs/reference/cli/supabase-migration-up)
