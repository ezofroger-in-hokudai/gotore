# 読み込み速度の改善（#11）

ユーザー報告は「毎回・全画面、特に過去の記録が遅い」。SupabaseはMumbai。本件ではユーザー指定によりリージョン・契約は変更せず、実装側を比較する。

## 維持する動作

- Authへの本人確認は毎回行う。接続だけを再利用し、ユーザーのCookie・認証ヘッダー・認証結果を別要求へ使い回さない。
- DBは毎回本人・グループ所属を確認する。共有データのCDNキャッシュは使わず、APIはno-store。
- 表示名が変わらない場合はSELECTだけで返す。未作成・変更時は従来のUPSERTと競合処理で同期し、Auth未設定時の既存名を保持する。
- ホームの5秒更新、非表示停止、失敗後の再試行、保存・編集・削除時の更新を維持する。

## 過去の記録の再訪

自分の記録一覧だけを、ログイン中の画面のメモリに最大5ページ・60秒保持する。URL（日付・ページを含む）ごとに区別し、保存・編集・削除などrefreshKeyの変更で破棄する。別ユーザーのログインではWorkspaceを作り直すため共有しない。localStorageや共有一覧には保存しない。

再訪時は前回の内容をすぐ表示し、「更新中…」とともに必ずAPIで再確認する。成功時に置換し、失敗時は古い一覧を消してエラーと再試行を表示する。長時間経過後・新しいページでは従来どおり取得を待つ。初めて読む履歴の短縮はAPI側の改善で行う。

## 計測

APIのServer-Timingに数値だけを付ける。

| 名前 | 範囲 |
| --- | --- |
| auth | Supabase Authへの往復 |
| db_connect | DB接続の確立 |
| profile | 本人プロフィールの確認・必要時の同期 |
| app | middlewareからレスポンス開始まで（上記を含む） |

URL・トークン・SQL・個人情報は計測ヘッダーへ入れない。appはコールドスタート、インターネットの往復、本文の転送・描画、依存の後処理を含まない。appと各区間を足し合わせない。

本番ではブラウザのNetworkでworkoutsの待ち時間とServer-Timingを比較する。記録10件・50件、初回・再訪、同一回線で各5回以上を分けて記録する。healthだけで認証済み画面の改善率を判断しない。

## 比較と適用

`TEST_DATABASE_URL`に使い捨ての空の`_test` DBを指定して、次を実行する。

```bash
backend/.venv/bin/python scripts/benchmark_loading.py --samples 8
```

既存アプリのテーブルがあるDBは使わない。ベンチマークのschema・データはトランザクション内に作成しロールバックする。比較元はmainの217c63c。遅延付きローカルAuth（接続60ms・応答20ms）と実PostgreSQL（SQL往復ごとに40ms追加）を使い、初回1件を除いて8回比較する。DB接続はこの比較では共用しており、クラウドDB接続・実インターネット・画面の値ではない。

| 方式 | 一覧API中央値 | SQL/要求 | Auth接続数（初回込み9要求） |
| --- | ---: | ---: | ---: |
| 現行 | 230.2ms | 3 | 9 |
| HTTP接続を再利用 | 150.4ms | 3 | 1 |
| 変更なしのprofileをSELECTだけにする | 186.2ms | 2 | 9 |
| 両方 | 109.1ms | 2 | 1 |

この条件では併用を採用。DB pool・初回APIの集約・JWT検証方式は、本番で残る区間を計測してから比較する。新しいDB migrationは不要。

公開healthの別比較は新規接続392.7ms、再利用222.2ms（各6回、初回を除く中央値）。経路はhnd1::iad1で、Supabase Mumbaiとの距離も今後の候補だが、本件では設定を変えない。無料枠だけが原因とは断定していない。

## 調査した公式資料（2026-09-08）

- [HTTPX Client](https://www.python-httpx.org/advanced/clients/): TCP接続再利用と終了処理。
- [Vercelのリージョン](https://vercel.com/docs/functions/configuring-functions/region): DBに近い配置、Hobbyでも単一リージョンの指定が可能。
- [Supabase Performance Tuning](https://supabase.com/docs/guides/platform/performance): SQL・接続数・リソースの確認。

過去の記録50件の日付表示も、同じIntl.DateTimeFormatを再利用する。調査端末のNodeで50件を10回比較した中央値は作り直し2.43ms、再利用0.038ms。描画の小さな削減であり、通信待ちの主因とはみなさない。

[FastAPIのlifespanはVercelでもサポートされる](https://vercel.com/docs/frameworks/backend/fastapi)。HTTP接続はlifespanで準備・終了し、上限20接続・待機5接続・待機30秒に制限する。

新規プロフィール・名前変更時は先行SELECTが1往復増える。頻度の高い通常の閲覧を優先し、初回・変更時の整合性は既存DBテストで確認する。
