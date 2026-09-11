# SCOREの画面確認（#99）

Playwrightの固定データで撮影。スコア88点・目標・コメントはテスト応答で、実モデルの出力ではない。実アカウントの個人情報は含まない。

- [終了結果・390px](score-result-390.png)、[320px](score-result-320.png)、[430px](score-result-430.png)
- [AI採点待ち](score-pending.png): コメント応答を止めてもホームへ移動できる。
- [ホームのスコア](score-home.png): 目標本文・一言を公開しない。
- [目標の確認・編集](score-goal-review.png): AI提案後に本人が条件を修正し、確認して保存する。保存ボタンまでスクロールした状態。

算式は `docs/score.md`、保存・再試行・非共有範囲は [実装仕様](../../score-implementation.md)。

## 検証と計測

`make check` 成功（backend194件・frontend41件、lint/型検査/build）。スコアE2E3件で待機中の遷移・確定後の履歴・目標の確認保存・各幅の横はみ出しを確認。全E2Eの結果は `progress.md`。

専用の空 `_test` DBで再現する計測:

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/gotore_recovery_test backend/.venv/bin/python scripts/benchmark_score.py
```

接続文字列は手元の専用DBへ置換する。追加migrationをトランザクション内で展開し、1000記録・3万セットを作成して全件ロールバックする。ローカル20回の中央値/p95は以下。

| 処理 | 中央値 | p95 |
| --- | ---: | ---: |
| SCOREの保存を含む終了 | 53.65ms | 80.58ms |
| 保存済み本人スコアの取得 | 7.07ms | 10.70ms |
| 50記録へのスコア要約付与（採点済み1件） | 1.43ms | 2.57ms |

Repositoryの処理時間であり、HTTP/Auth/LLMの待ち時間と本番の負荷は含まない。実モデルの速度・費用・判定品質はAPIキー未設定のため未測定。
