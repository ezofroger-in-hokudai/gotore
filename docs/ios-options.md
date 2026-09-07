# iOS移植の比較調査（#9）

調査日: 2026-09-08。現行コードの基準はmain `fff26d4`。本資料は方式の採用決定ではなく、次の検証を選ぶための比較である。API・業務ルールを維持する[開発方針](development-policy.md)に従う。

## 推奨する順序

現時点ではホーム画面Webを継続し、#23の実機受け入れで具体的な不足を特定する。端末機能が必要になった場合は、既存画面を使うCapacitorの小さな試作を先に比較する。iOS・Android両方で独自のネイティブ操作が必要ならReact Native、iOS固有機能を深く扱う必要が明確ならネイティブ実装を比較する。

これは現行コードと保守負担からの提案であり、工数を実測した結論ではない。SDK導入・ストア登録・配布・課金・実装方式の採用は行っていない。

## 比較

| 候補 | 画面・ロジック再利用 | API・認証 | 下書き | 主な追加負担 |
| --- | --- | --- | --- | --- |
| ホーム画面Webを継続 | 現行Next.jsのUI・CSSを維持 | 現行の同一オリジンAPI・Supabase client | 現行localStorage。ブラウザやインストール間の移行を保証しない | 実機キーボード、再起動、復帰、回線切替の確認 |
| CapacitorでWeb UIを同梱 | React DOMとCSSを主に再利用。Next.jsサーバー機能はそのまま同梱できる前提にしない | FastAPI再利用。`/api`の相対URLを接続先設定へ分離。WebViewのAuth復帰を検証 | WebViewストレージへの暗黙移行はしない。小規模な非機密設定とトークンの保存先を分ける | Xcode・署名・プラグイン・Webとアプリのリリース管理 |
| React Native（Expo等を比較） | React/TypeScriptの知識と純粋関数を活用。HTML/CSSの画面は作り直す | FastAPI再利用。ネイティブ側のHTTP・認証セッション管理を実装 | 保存アダプターと入力UIを実装。本人ID・形式検証を維持 | iOS/Androidのネイティブ依存、ビルド、画面・E2Eの再整備 |
| iOSネイティブ | 画面とブラウザ依存の処理を新規実装。Python業務APIは維持 | HTTPでFastAPI、認証セッションの安全な保存・復帰を実装 | アプリ領域へ新規保存。Webからの移行を別設計 | iOS専用実装の保守。Android画面は別途必要 |

CapacitorはWKWebViewを使う。調査時点のv8資料はiOS 15以上・Xcode 26.0以上を案内している。これをGO TOREのサポートOSに決定したわけではない。[Capacitor iOS](https://capacitorjs.com/docs/ios)

React Nativeはネイティブ画面を作る方式で、公式は新規アプリにExpo等のFrameworkを推奨している。採用する場合も候補の比較から開始する。[React Native Get Started](https://reactnative.dev/docs/environment-setup)

## 現行コードの変更境界

- `frontend/src/lib/api.ts`: `/api`への相対URL、ブラウザのfetch、Supabase session取得を接続・認証の境界として分ける。FastAPIの所有者・所属チェックをクライアントへ移さない。
- `frontend/src/lib/supabase.ts`: 現行ブラウザ向けclientをそのままネイティブの保存仕様とみなさない。ログアウト・期限切れ・復帰を検証する。
- `frontend/src/features/training/draft.ts` と `workout-form.tsx`: 入力制約、JST日付、送信ID・再試行の意味を維持し、localStorageとDOMフォーカス／Enter処理を別の実装へ置き換える。
- `frontend/next.config.mjs` と `vercel.json`: Next.jsのrewrite／Vercelのルーティングはサーバー側に残る。アプリ同梱版では公開HTTPS APIの接続先を用意する。DB接続情報や管理キーをアプリへ含めない。
- `backend/app/domain`・`services`・`infrastructure`: FastAPIの入力制約、共有範囲、保存整合性を共通の根拠として維持する。モバイル用の重複採点・権限実装を作らない。

保存済み記録はAPIで再取得できるが、未送信のWeb下書きはサーバーにない。初回の移植では「Webで保存してから移る」導線を候補とし、自動移行を前提にしない。移行機能を採用するなら本人一致・入力検証・置き換え確認・二重送信防止を受け入れ条件にする。

Capacitorの公式はWebViewのlocalStorage／IndexedDBを永続保証として使わず、用途に応じた保存先を選ぶよう説明している。[Capacitor Storage](https://capacitorjs.com/docs/guides/storage)

トークンは一般の設定ストレージと分離し、iOS KeychainなどOSの保護機構を候補にする。React Native公式も機密情報を通常の非暗号化ストレージに置かないよう案内している。[React Native Security](https://reactnative.dev/docs/security)、[Apple Keychain](https://developer.apple.com/documentation/security/keychain-services)

## ホーム画面Webで先に確認すること

現行アプリにはmanifest・Appleアイコンがあるが、オフライン保存キューやPush配信は実装していない。ネイティブ化だけで記録共有の通信遅延やバックグラウンド更新が解決すると想定しない。

iOS/iPadOS 16.4以降のホーム画面Webは、ユーザー操作から許可を求めるWeb Pushに対応する。Pushだけを理由に直ちにネイティブ化する必要はない。実装する場合は通知対象・拒否時の動作を#21で決める。[WebKit公式解説](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

HealthKit、Bluetooth機器との連携、App Store経由の配布などの必要性はまだ確認できない。これらの採用を仮定して新しい基盤を導入しない。

## 署名・実機・配布の条件

- Xcodeを動かすMacと対応OSを確認する。Macの機種・macOS・Xcodeの組合せは着手時に再確認する。[Appleのシステム要件](https://developer.apple.com/xcode/system-requirements)
- 無料のApple AccountによるPersonal Teamでは個人用の実機検証が可能だが、登録数や7日ごとの再プロビジョニング制約がある。継続配布と同一視しない。
- Apple Developer Programは年99 USDまたは現地通貨相当額。組織の資格による免除制度がある。機材・CI・外部サービス代は別で、今回は購入しない。[Apple Membership比較](https://developer.apple.com/support/compare-memberships/)
- TestFlightはApp Store Connect経由でテスト情報・連絡先を設定し、外部テスト向けにはベータ審査情報が必要。登録・配布は別タスクとする。[Apple TestFlight](https://developer.apple.com/testflight/)
- 単純なWebサイトの包み直しで審査を通ると保証しない。機能・プライバシー説明・ログインが必要な場合の審査用アクセスを整える。自己登録を追加する場合はアカウント削除の要件も確認する。[App Review Guidelines 4.2・5.1.1](https://developer.apple.com/app-store/review/guidelines/)

## Androidとの共通部分とiOS固有部分

#10と共通化できるのはAPI契約、入力ルール、所有者・所属チェック、保存IDと再送、画面遷移、認証・保存アダプターの検証観点。Capacitor／React Nativeを選ぶ場合は共通コードの範囲を試作で測る。

iOS固有なのはMac/Xcode、署名とプロビジョニング、Keychain、Apple側の権限・審査・配布条件、実機キーボードやホーム画面からの復帰である。Androidの採用方式はこのIssueで決定しない。

## 次の検証案と未決事項

1. #23で、利用中のiPhone・iOS版・Safariから追加したホーム画面Webについて、ログイン→記録→下書き復元→共有→再起動→回線切替を記録する。Androidでも同じ受け入れ表を使う。
2. 不足する端末機能が明確になった場合だけ、別Issue「iOS方式の最小試作」を選ぶ。対象はログイン・本人記録1件・下書き復元・ログアウトまで。模擬データでWebと比較し、開発時間・再利用箇所・入力品質・復帰を記録する。
3. 必要機能、最低OS、利用可能なMacと実機、保守担当の経験、配布先、年間費用を確認してから方式を採用する。現時点では未決定。

実機を操作した結果、ストア審査結果、工数見積りは本調査に含めていない。次の試作Issue案は上記の条件が揃った時点で具体化する。
