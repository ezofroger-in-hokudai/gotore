# 現在のシステム

更新日: 2026-09-07。実装Issue: [#1](https://github.com/ezofroger-in-hokudai/gotore/issues/1)。
初版の完成ラインはユーザー指定の「グループ作成・記録・記録共有」です。
仕様とMOCK資料からの変更点は [standard-v0.1-scope.md](standard-v0.1-scope.md)、検証結果は [progress.md](../progress.md) を参照してください。

## 実装した機能

| 機能 | 動作 | 主な配置先 |
| --- | --- | --- |
| アカウント | Supabase Authで登録・ログイン・ログアウト。APIがトークンを検証 | frontend/src/features/training/auth-panel.tsx、backend/app/api/dependencies.py |
| グループ | 作成・招待コードによる参加・所属グループ一覧・メンバー表示 | group-panel.tsx、backend/app/services/training.py |
| 記録 | 日付・種目・重量・回数・セットをDB保存。下書きを同じブラウザで復元 | workout-form.tsx、backend/app/domain/workout.py |
| 共有 | 保存時に選んだグループだけへ共有。メンバー限定の一覧 | backend/app/infrastructure/training_repository.py、record-list.tsx |
| 自分の記録 | 過去の実データを日付順に閲覧。再ログイン後も保持 | frontend/src/features/training/training-app.tsx |
| ホーム画面起動 | Web manifest、standalone設定、PNGアイコン、安全領域。オンライン利用が前提 | frontend/src/app/manifest.ts、apple-icon.tsx、layout.tsx |
| DB・設定 | migration、RLS、外部キー・一意制約、ローカル設定の生成 | supabase/migrations/、scripts/configure_local.py |

公開APIは `/api`。WebのリクエストをNext.jsからFastAPIへ転送します。
業務データはFastAPI経由で操作し、ブラウザからのDB直接アクセスはRLSで拒否します。
ローカルSupabaseのプロジェクトIDは `gotore`、ポートは59320番台です。

## 検証

- backend: 入力制約・認証・グループ参加・共有範囲・再送・DB直接アクセス拒否の23テスト。
- frontend: 下書き復元・入力制約・ホーム画面設定の単体テスト。
- E2E: 別ブラウザでの登録・グループ作成・参加・記録共有、通信再試行、下書き復元、再ログイン。
- ホーム画面: manifest・メタ情報・PNG配信をブラウザで検証。HTTPS公開とiPhone／Android実機での追加・再起動確認は未実施。
- CI: backend／frontend／database。PostgreSQL統合テスト、Supabase migration、ブラウザテストを含む。
- 最新の実施結果と未実施項目は `progress.md` に記録する。

## 後続で扱うもの

SCORE、AI、ランキング、スタンプ、コメント、Push通知、詳細な履歴分析、記録の編集・削除、グループの退出・招待管理、アカウント管理、公開環境へのデプロイ、Android／iOSアプリ。

今週追加するものは、初版を使って確認した結果からIssueにします。
GitHubのmain保護・レビュー必須設定は、管理者が設定状況を確認してください。
