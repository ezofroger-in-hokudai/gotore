# ライブ表示とプロフィール画像

2026-09-09のユーザー依頼「ライブ感を出す」「設定からアイコン画像を変更」を追加範囲とする。[Issue #67](https://github.com/ezofroger-in-hokudai/gotore/issues/67)で追跡し、週次計画 #33 の使用後改善として扱う。

## 表示

- アイコン右下の赤い丸・赤い輪郭と短いLIVE表示で記録中の人を示す。グループの人数・顔・フィードで同じ状態を使う。0人・未取得・失敗時は点滅させない。
- LIVEの条件はv2仕様を維持する。サーバーの期限を受け取り、取得が保留されても期限後はLIVE表示を止める。通信断・再訪時のキャッシュを現在のLIVEと扱わない。
- 新しく届いたセットの行を一度だけ短く強調する。初回取得、同じデータの再取得、グループ切替は新着扱いしない。時刻は「たった今」「n分前」等にし、元の日時も確認できる。
- 動きを減らす設定ではアニメーションを停止する。画面・タブが非表示の間はタイマーと更新を止める。

## 画像

- 設定のアカウント欄から選択、円形プレビュー、保存、削除ができる。保存前のキャンセルは登録済み画像を変えない。保存失敗時はプレビューを保持して再試行できる。
- JPEG・PNG・WebP、元ファイル10MB以下。ブラウザで中央を正方形に切り抜き256pxへ縮小する。API側でも形式・サイズ・画素数を検証し、JPEGへ再エンコードしてEXIFなどを除去する。API上限512KiB、保存画像128KiB以下。元画像を保存しない。
- 小さな画像を1人1枚だけ、既存PostgreSQLの専用テーブルへ保存する。通常の5秒更新には画像本体を含めず版IDだけを返し、画像は認証付きAPIで必要時に取得する。別のストレージ基盤・公開バケット・秘密キーを追加せず、将来の保存先変更はrepositoryに閉じ込める。
- 本人だけが更新・削除でき、本人と現在同じグループに所属するメンバーだけが閲覧できる。未認証・第三者・退出後には取得できない。API応答はno-store。画像キャッシュはログイン中の画面メモリだけに限定する。
- 未設定・取得失敗時は名前の頭文字を表示する。URLを入力する方式や公開URLへの保存は導入しない。

## 調査と採用理由

- [Carbonの状態表示](https://carbondesignsystem.com/patterns/status-indicator-pattern/): 小さな丸とラベルを組み合わせる。通知件数のバッジではなく、記録中の状態として使う。
- [MDNのprefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion): OSの動作軽減設定に従う。
- [Pillow Image](https://pillow.readthedocs.io/en/stable/reference/Image.html)・[ImageOps](https://pillow.readthedocs.io/en/stable/reference/ImageOps.html): 実形式の検証、画素数制限、EXIFの向き補正、縮小・再エンコードに使用する。
- [Supabaseのバケット](https://supabase.com/docs/guides/storage/buckets/fundamentals): 公開画像はURLを知る人が取得できる。今回の小規模な本人・同一グループ限定画像は既存APIの認可内で完結させる。

## 検証・反映

APIの画像検証・権限・削除・版更新、LIVE期限、画像の選択・キャンセル・保存失敗・再試行、実Supabaseで別利用者への表示と退出後の拒否を確認する。make check、make test-e2e、320/390/430px・文字2倍・ライト/ダーク・動作軽減を確認する。追加migrationはAPIリリース前に適用する。本番反映と実機確認は別途行う。

画面例: [ホームと画像設定](images/live-avatars/README.md)。
