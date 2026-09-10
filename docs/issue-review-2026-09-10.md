# 仕様・実装の監査（2026-09-10）

ユーザーの「仕様との差分・改善点をIssueへ追加」と、追加の「未記載の機能案・表示と保存の高速化」の依頼に基づく。アプリの修正や新仕様の採用は行わず、既存Issueとの重複を除いて16件を登録した。

## 確認基準

- ローカル: `feat/live-presence-avatars / 28f408e`。GitHub main: `a6998a4`（PR #68統合）。GitHub Compareで両者のファイル差分0件を確認。
- [資料一覧](README.md)から適用範囲を確認し、[v2仕様](gotore-v2-spec.md)を優先。旧MOCKの未採用機能を不具合扱いしない。
- 開始時の既存Issue43件、open18件、open PR 0件を照合。実機PWA #65・前種目への移動 #66・未採用のAI/通知等は重複登録しない。
- 担当・レビュー担当・着手週は未定。#33の計画や既存担当を変更しない。

## 登録したIssue

| Issue | 分類 | 優先度案 | 内容 |
| --- | --- | --- | --- |
| [#69](https://github.com/ezofroger-in-hokudai/gotore/issues/69) | 不具合 | P1 | 重量欄のEnterでセットが保存・共有されてしまう |
| [#70](https://github.com/ezofroger-in-hokudai/gotore/issues/70) | 不具合 | P1 | 未保存の今回メモが終了時に案内されず、履歴からも復元できない |
| [#71](https://github.com/ezofroger-in-hokudai/gotore/issues/71) | 不具合 | P2 | グループ一覧から別グループを開くと、戻る・進むで対象が入れ替わる |
| [#72](https://github.com/ezofroger-in-hokudai/gotore/issues/72) | 不具合 | P2 | 過去月の履歴詳細から戻ると、カレンダーだけ当月へ戻ってしまう |
| [#73](https://github.com/ezofroger-in-hokudai/gotore/issues/73) | 復旧改善案 | P2 | 初回のセッション復元に失敗すると、通信復帰しても開始・再開できないままになる |
| [#74](https://github.com/ezofroger-in-hokudai/gotore/issues/74) | 復旧改善案 | P2 | 一覧APIの応答が止まるとポーリングも止まり、画面内で再試行できない |
| [#75](https://github.com/ezofroger-in-hokudai/gotore/issues/75) | 仕様整合性 | P1（仕様確認後に修正） | 記録コピーの下書き仕様と、v2の即時保存・共有動作を整合させる |
| [#76](https://github.com/ezofroger-in-hokudai/gotore/issues/76) | 復旧改善案 | P2・改善案（採用判断待ち） | 競合した未送信セットを、手作業で控えずに復旧できる導線を検討する |
| [#77](https://github.com/ezofroger-in-hokudai/gotore/issues/77) | 高速化 | P2 | 【高速化】未送信セットの全量コピーを減らし、端末保存と再送を軽くする |
| [#78](https://github.com/ezofroger-in-hokudai/gotore/issues/78) | 高速化 | P2 | 【高速化】ホームの全グループ活動取得を集約し、表示外フィードの通信を減らす |
| [#79](https://github.com/ezofroger-in-hokudai/gotore/issues/79) | 高速化 | P2 | 【高速化】保存完了後に非表示の記録画面を再取得する通信を減らす |
| [#80](https://github.com/ezofroger-in-hokudai/gotore/issues/80) | 高速化 | P2 | 【高速化】BEST判定・前回比較で全ワークアウトJSONを読む処理を最適化する |
| [#81](https://github.com/ezofroger-in-hokudai/gotore/issues/81) | 未採用の機能案 | P2・未採用案 | 【機能案】セット間の休憩タイマーを記録画面から使えるようにする |
| [#82](https://github.com/ezofroger-in-hokudai/gotore/issues/82) | 未採用の機能案 | P2・未採用案 | 【機能案】トレーニング終了後に、その回の成果を確認できるようにする |
| [#83](https://github.com/ezofroger-in-hokudai/gotore/issues/83) | 未採用の機能案 | P2・未採用案 | 【機能案】本人のトレーニング記録をファイルに書き出せるようにする |
| [#84](https://github.com/ezofroger-in-hokudai/gotore/issues/84) | 未採用の機能案 | P2・未採用案 | 【機能案】グループのオーナーを別のメンバーへ引き継げるようにする |

## 再現・計測

- Linux/Chromium、390×844、既存mockTrainingの架空データを使用。重量Enterで77.5kg×10回の保存、未保存メモの終了時未案内・履歴未復元、グループBの履歴にAのIDが入り戻る/進むでAへ変わる現象、1月の詳細から戻るとカレンダーだけ9月になる現象を再現。
- 応答保留中の一覧では、初期要求数が安定してから11秒間、新しい要求も再試行ボタンも出ない。期限がコードにないことと合わせて#74へ記載。
- 実SessionQueueの初回load失敗後に通信を復旧してsyncを2回呼んでも、loadは1回・ready=false。手動の読み直しは可能であることを#73へ明記。
- 5グループのホームを10.5秒観測するとactivity各2回（合計10）＋groups2回。設定へ移った後の5.5秒はactivity0回。非表示停止自体の不具合と混同せず、ホームで必要なデータ量の改善を#78へ提案。
- PATCH保留中にホームへ移動して応答を返すと、非表示の記録画面用contextが1回再取得された（#79）。

通信なしで実SessionQueueへ追加するBun比較。write先はメモリで、localStorageのOS書き込みや実機速度を含まない。

| セット数 | キュー UTF-8 bytes | 最終状態だけの bytes | 直近30追加の中央値 ms |
| ---: | ---: | ---: | ---: |
| 30 | 14,064 | 749 | 0.09 |
| 150 | 293,664 | 3,741 | 1.86 |
| 300 | 1,148,094 | 7,482 | 7.79 |
| 600 | 4,541,844 | 14,972 | 35.41 |

600セット分の要求本文合計は4,528,872 bytes。最後の30追加の最大は54.69ms。別途Chromiumの新規コンテキストで実localStorageへ600件保存成功。容量エラー・消失を再現したとは扱わない。基準状態＋操作列等の比較は#77で行い、再送・BEST・取消の意味を保つ。

## 検証結果と限界

- frontend単体: `cd frontend && bun test tests/unit`、29件成功。無変更編集の保存通知は正常だったためIssue化しなかった。
- 一覧応答保留の初期要求数を固定した再現は失敗。初期要求安定後の増分を確認する方法へ直し、再検証した。
- コピーは仕様・単体/E2Eコードの静的照合。既存E2Eは即時保存、旧仕様・単体は下書きを期待するため、#75は採用判断を含む。今回そのE2E自体を再実行したわけではない。
- #80のSQL最適化はコード・既存性能テストの照合による候補。今回実DBでのEXPLAIN・性能比較は行っていない。
- 全make check・実Supabase E2E・本番計測・iPhone/Android実機確認は未実施。アプリ変更がないため、監査用の一時再現と文書・リンク・差分検証に絞った。
- 作成16件のopen状態、本文の保存、担当未割当をGitHubから再取得して確認。接続アプリの書き込み403は既存gh認証で代替し、未投稿のIssueはない。
- 一時再現スクリプトは `/tmp/gotore-audit-20260910/`。修正時には各Issueの条件をリポジトリの回帰テストへ追加する。

## 次の判断

まず#69・#70の意図しない保存／メモ復旧、#75のコピー契約を整理する。性能は#77〜#80を#11の具体的な作業として比較・採用する。#81〜#84は新機能候補であり、要否・範囲を合意してdocsへ記載してから実装する。

## 実装追補（2026-09-10）

ユーザーの実装依頼で、週次計画#33に#69・#71・#72・#73・#79を追加し、imtkgtrへ割り当てた。#71の対象グループ保持、#72の履歴月保持、#73の初回復元の再試行、#79の非表示時の再取得抑止を実装・検証。#69は重量Enterの誤保存とIME／長押しを修正済みだが、回数欄Enterの採用動作は回答待ちのため未完了。SCORE #13、コピー契約#75、新機能候補#81〜#84は未採用のまま。

標準make check（backend140件・frontend29件・lint・build）、実Supabase共有を含むE2E69件成功。補助tscは既存bun:test型解決不足3件で失敗した。実機・本番の速度は未測定。修正の目的別コミットとPRでレビューし、マージは行わない。

実装PR: [#85 記録入力と画面復帰の不具合・不要な比較取得を改善](https://github.com/ezofroger-in-hokudai/gotore/pull/85)。最新CIとレビュー結果はPRを参照する。
