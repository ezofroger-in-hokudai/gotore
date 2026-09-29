# 進行中の経過時間（Issue #202）

## 採用したE-5

- [操作プレビュー](../../../frontend/public/previews/session-stopwatch-adopted.html): 開始前・計時中、ホーム・記録入力、幅・配置・経過時間を切り替える。
- [派生5案の比較](../../../frontend/public/previews/session-stopwatch-e-variants.html): E-5を選ぶまでの比較。
- [ホーム390px・0:12](home-adopted-390.png) / [記録入力390px・0:12](record-adopted-390.png): ローカルE2Eの架空データで撮影した実画面。開始前は操作プレビューで確認できる。

時計全体を押して開始・再開する。上のつまみと右の押し部品は装飾で、別々の停止操作にはしない。

## 以前のPR表示

390×844 CSS pxのローカルChromium画面。架空のトレーニングを開始から12分経過した状態で表示した。

| ホームのRESUME | 記録入力 |
| --- | --- |
| ![RESUME内の12分表示](home-390.png) | ![記録ヘッダーの12分表示](record-390.png) |

両画面の経過時間は同じ`started_at`を基準にする。画面の幅・高さはブラウザE2Eで320/390/430pxを確認した。実機PWAでの表示・スリープ復帰は別途確認する。
