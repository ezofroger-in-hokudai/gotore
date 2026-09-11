# SCOREの画面確認（#99）

Playwrightの固定データで撮影。スコア88点・目標・コメントはテスト応答で、実モデルの出力ではない。実アカウントの個人情報は含まない。

- [終了結果・390px](score-result-390.png)、[320px](score-result-320.png)、[430px](score-result-430.png)
- [AI採点待ち](score-pending.png): コメント応答を止めてもホームへ移動できる。
- [ホームのスコア](score-home.png): 得点を右側へ大きく表示。得点のタップでも記録詳細へ進める。目標本文・一言を公開しない。
- [最高SCOREヒートマップ](score-heatmap.png): 本人の日別最高点。ホーム・終了結果と同じ固定色。
- [目標の確認・編集](score-goal-review.png): AI提案後に本人が条件を修正し、確認して保存する。期間選択欄を省き、確認して保存する。

算式は `docs/score.md`、保存・再試行・非共有範囲は [実装仕様](../../score-implementation.md)。

## 検証と計測

追加前の `make check`（backend194件・frontend41件）とCI全件が成功。表示・ヒートマップ・最終余白調整後のmake checkも成功（backend196件・frontend41件、lint/型検査/build）。ブラウザ検証は本機のメモリ圧迫で一部タイムアウトし、最終の全件結果はPRのCIで確認する。得点の右配置とナビへの重なりなしは新規画面テストで成功。スコアE2E3件で待機中の遷移・確定後の履歴・目標の確認保存・各幅の横はみ出しを確認。全E2Eの結果は `progress.md`。

専用の空 `_test` DBで再現する計測:

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/gotore_recovery_test backend/.venv/bin/python scripts/benchmark_score.py
```

接続文字列は手元の専用DBへ置換する。追加migrationをトランザクション内で展開し、1000記録・3万セットを作成して全件ロールバックする。ローカル20回の中央値/p95は以下。

| 処理 | 中央値 | p95 |
| --- | ---: | ---: |
| SCOREの保存を含む終了 | 36.45ms | 42.76ms |
| 保存済み本人スコアの取得 | 4.00ms | 4.64ms |
| 50記録へのスコア要約付与（採点済み1件） | 0.88ms | 1.25ms |

| 月別最高SCOREの取得 | 0.69ms | 1.31ms |

Repositoryの処理時間であり、HTTP/Auth/LLMの待ち時間と本番の負荷は含まない。実モデルの速度・費用・判定品質はAPIキー未設定のため未測定。
