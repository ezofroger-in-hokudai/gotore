# テストの使い分けと実行時間（#192）

## 現行仕様の責務

[テスト責務と移行先](testing-coverage.md)を参照する。UIと実Auth/DBをPlaywright projectで分けるが、CIは両方を必ず実行する。

```sh
make test-e2e E2E_ARGS='--project=ui --workers=2'
make test-e2e E2E_ARGS='--project=integration --workers=2'
```

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
- コード変更を含むPRのCIではDB migration・全backend/frontendチェック・全E2Eを実行する。合格前にマージしない。`test:e2e:ci`はファイルを限定せず全specを実行する。失敗時はCIの`e2e-failure-reports`から画面状態・traceを確認できる。資料のみ（docs/と指定したルート文書）のPRは差分確認だけ行う。不明なパス、アプリ、テスト、CI設定、DB変更があれば全チェック。mainへのpushは常に全件。判定失敗時も全チェックへ回す。差分ではrename検出を無効にして移動元も判定し、コードをdocsへ移した変更を見逃さない。
- CIが実行できない場合、記録・共有・共通UI・テスト基盤の変更ではローカルでも`make test-e2e`を全件実行する。
- 検証済みのコードに変更がない場合、画像や進捗文書の追記だけで全E2Eを再実行しない。失敗した場合は原因に関係する対象を再検証し、結果を正確に記載する。

## 並列数と古い実行

CIは2 worker、ローカルは既定1 worker。メモリに余裕がある環境では`E2E_ARGS='--workers=2'`で同じ並列数を使う。ファイル内の順序は維持し、ファイル間だけ並列化する。大量のworkerやリトライで失敗を隠す設定は追加しない。

同一PRに追加pushされた場合は、そのPRの古いCIをキャンセルする。別PRやmainの実行はキャンセルしない。必須チェック名backend/frontend/databaseは維持する。

## 時間待ちの検証

ポーリング・無操作の待ちはPlaywright Clockで進める。本番の間隔は変更しない。実Auth/複数人の送受信は実時間で確認する。終了結果のスタンプはポーリングしない現行仕様に合わせ、詳細を閉じる時の再取得・既読・再試行を確認する。

## 過去の計測

PR #192時点の207件はローカル2 workerで7.4分。ケースと仕様が変わるため、今回の時間と同一条件の速度比較には使わない。各PRでは件数・worker数・実Auth/DBの有無・失敗を含む時間を記録する。
