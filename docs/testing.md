# テストの使い分けと実行時間（#192）

## 開発中

```sh
make check-fast
make test-e2e E2E_ARGS='visible-sets.spec.ts memo-recovery.spec.ts'
```

`check-fast` はlint・型・backend/frontendの単体テスト。ビルドだけを省く反復用コマンドで、DBテストは従来どおり専用の`TEST_DATABASE_URL`が必要。`make check`はビルドを含む従来の全チェックを維持する。

`E2E_ARGS` はPlaywrightの引数。ファイル名を指定すると、そのファイルに含まれるテストを実行する。未指定の`make test-e2e`は全件。存在しない対象はエラーになり、0件成功にはしない。Playwrightはファイル名を正規表現として照合するため、実行前に`--list`で対象を確認できる。`--pass-with-no-tests`は使わない。

```sh
make test-e2e E2E_ARGS='visible-sets.spec.ts --list'
make test-e2e E2E_ARGS='visible-sets.spec.ts --workers=2'
```

メモ/記録ヘッダーならvisible-sets・memo-recovery・recording-accessibility・session-flow等を選ぶ。API・認証・権限・共有・保存/復元の変更は実DB/実Authのシナリオも含める。曖昧な依存関係を自動推測してテストを飛ばす仕組みは導入しない。UI単独のテストにも現行設定ではサーバー起動が必要。

## レビュー前とCI

- ローカルは`make check`と変更に関係するE2Eを実行し、実行対象・未実施範囲をPRへ記載する。
- コード変更を含むPRのCIではDB migration・全backend/frontendチェック・全E2Eを実行する。合格前にマージしない。資料のみ（docs/と指定したルート文書）のPRは差分確認だけ行う。不明なパス、アプリ、テスト、CI設定、DB変更があれば全チェック。mainへのpushは常に全件。判定失敗時も全チェックへ回す。差分ではrename検出を無効にして移動元も判定し、コードをdocsへ移した変更を見逃さない。
- CIが実行できない場合、記録・共有・共通UI・テスト基盤の変更ではローカルでも`make test-e2e`を全件実行する。
- 検証済みのコードに変更がない場合、画像や進捗文書の追記だけで全E2Eを再実行しない。失敗した場合は原因に関係する対象を再検証し、結果を正確に記載する。

## 並列数と古い実行

CIは2 worker、ローカルは既定1 worker。メモリに余裕がある環境では`E2E_ARGS='--workers=2'`で同じ並列数を使う。ファイル内の順序は維持し、ファイル間だけ並列化する。大量のworkerやリトライで失敗を隠す設定は追加しない。

同一PRに追加pushされた場合は、そのPRの古いCIをキャンセルする。別PRやmainの実行はキャンセルしない。必須チェック名backend/frontend/databaseは維持する。

## 時間待ちの検証

stamp-receipt-inlineの3幅テストでは、ポーリング10秒・新着表示5秒の待ちをPlaywrightのClockで進める。本番の間隔を短くせず、DOM更新・取得失敗・再試行・入力位置保持のassertionは残す。実Auth/2人のスタンプ送受信は実時間のまま確認する。

[Playwrightの並列実行](https://playwright.dev/docs/test-parallel) / [Clock](https://playwright.dev/docs/clock)

## 計測

元の参考値はPR #191の全E2E210件で約13分（API接続先による3件の失敗を含む）。本改善はmain起点の207件で検証するため、総時間の比較は厳密な同一条件ベンチマークではない。

同じスタンプ受信3幅のテスト本体は、前回の実時間待ち約86秒に対して仮想時間版で約16秒（起動等込み22.3秒）。テスト件数と確認範囲は維持している。CI全体にはSupabase/Docker/ブラウザの準備時間も加わるため、ローカルの短縮率をそのままCIの短縮率とは扱わない。

改善後のローカル全E2Eは207件すべて成功、2 workerで7.4分。基準とした前回13.1分より短いが、上記の条件差があるため約44%短縮は参考値。CI runnerでの時間はPRの実行結果を別途確認する。
