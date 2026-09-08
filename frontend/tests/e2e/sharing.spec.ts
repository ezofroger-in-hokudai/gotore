import { type Page, expect, test } from "@playwright/test";
import { createTestUser, testPassword } from "./local-auth";

async function login(page: Page, name: string, email: string) {
  await createTestUser(name, email);
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログインする →", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}

test("2人がグループへ参加し、記録を共有して再ログイン後も参照できる", async ({ browser }) => {
  const run = crypto.randomUUID();
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const b = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  const errors: string[] = [];
  pageA.on("pageerror", (error) => errors.push(error.message));
  pageB.on("pageerror", (error) => errors.push(error.message));
  const emailA = `gotore-${run}-a@example.test`;
  try {
    await login(pageA, "共有テストA", emailA);
    await pageA
      .getByRole("navigation")
      .getByRole("button", { name: "グループ", exact: true })
      .click();
    await pageA.getByLabel("グループ名", { exact: true }).fill("朝の合トレ部");
    await pageA.getByRole("button", { name: "グループを作成 →", exact: true }).click();
    const code = pageA.getByTestId("invite-code");
    await expect(code).toBeVisible();
    const invite = await code.innerText();

    await login(pageB, "共有テストB", `gotore-${run}-b@example.test`);
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "グループ", exact: true })
      .click();
    await pageB.getByRole("button", { name: "招待コードで参加", exact: true }).click();
    await pageB.getByLabel("招待コード", { exact: true }).fill(invite);
    await pageB.getByRole("button", { name: "グループに参加 →", exact: true }).click();
    await expect(pageB.getByTestId("invite-code")).toHaveText(invite);
    await expect(pageB.getByLabel("新しいグループ名", { exact: true })).toHaveCount(0);
    await pageA.getByLabel("新しいグループ名", { exact: true }).fill("夜の合トレ部");
    await pageA.route("**/api/groups/*", (route) => {
      if (route.request().method() === "PATCH") return route.abort();
      return route.continue();
    });
    await pageA.getByRole("button", { name: "グループ名を変更", exact: true }).click();
    await expect(pageA.getByRole("alert").filter({ hasText: "通信できません" })).toBeVisible();
    await expect(pageA.getByLabel("新しいグループ名", { exact: true })).toHaveValue("夜の合トレ部");
    await pageA.unroute("**/api/groups/*");
    await pageA.getByRole("button", { name: "グループ名を変更", exact: true }).click();
    await expect(pageA.getByRole("heading", { name: "夜の合トレ部", exact: true })).toBeVisible();
    await expect(pageA.getByTestId("invite-code")).toHaveText(invite);
    await pageB.bringToFront();
    await expect(pageB.getByRole("heading", { name: "夜の合トレ部", exact: true })).toBeVisible();
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "ホーム", exact: true })
      .click();

    await pageA.bringToFront();
    await pageA.getByRole("button", { name: "＋ トレーニングを記録", exact: true }).click();
    await pageA.getByText("自分の種目リストを管理", { exact: true }).click();
    await pageA.getByLabel("追加する種目名", { exact: true }).fill("ケーブルロウ");
    await pageA.getByRole("button", { name: "リストに追加", exact: true }).click();
    await expect(pageA.getByRole("status").filter({ hasText: "追加しました" })).toBeVisible();
    await pageA.getByLabel("種目名", { exact: true }).selectOption({ label: "ケーブルロウ" });
    await pageA.getByLabel("種目1 セット1 重量", { exact: true }).fill("82.5");
    await pageA.getByLabel("種目1 セット1 回数", { exact: true }).fill("8");
    await pageA.getByRole("button", { name: "＋ セットを追加", exact: true }).click();
    await pageA.getByLabel("種目1 セット2 重量", { exact: true }).fill("80");
    await pageA.getByLabel("種目1 セット2 回数", { exact: true }).fill("10");
    await pageA.getByRole("button", { name: "← 戻る（下書きは残ります）", exact: true }).click();
    await pageA.reload();
    await pageA.getByRole("button", { name: "＋ トレーニングを記録", exact: true }).click();
    await expect(pageA.getByLabel("種目1 セット1 重量", { exact: true })).toHaveValue("82.5");
    await expect(pageA.getByText("確定すると「夜の合トレ部」", { exact: false })).toBeVisible();

    // 一度だけ通信を失敗させ、入力を失わず同じ記録を再送できることを確認する。
    await pageA.route("**/api/workouts", (route) => route.abort(), {
      times: 1,
    });
    await pageA.getByRole("button", { name: "記録を確定して共有 →", exact: true }).click();
    await expect(
      pageA.getByRole("alert").filter({ hasText: "入力内容は残っています" }),
    ).toBeVisible();
    await expect(pageA.getByLabel("種目1 セット1 重量", { exact: true })).toHaveValue("82.5");
    await pageA.getByRole("button", { name: "記録を確定して共有 →", exact: true }).click();
    await expect(
      pageA.getByRole("status").filter({ hasText: "グループへ共有しました" }),
    ).toBeVisible();

    await pageB.bringToFront();
    await expect(pageB.getByRole("article").filter({ hasText: "ケーブルロウ" })).toHaveCount(1);
    const card = pageB.getByRole("article").filter({ hasText: "ケーブルロウ" });
    await expect(card).toContainText("共有テストA");
    await card.getByText("セットの詳細を見る", { exact: true }).click();
    await expect(card).toContainText("82.5");
    await expect(card).toContainText("グループに共有済み");
    expect(
      await pageB.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await pageB.screenshot({
      path: "test-results/group-feed-mobile.png",
      fullPage: true,
    });

    await pageA.bringToFront();
    await pageA
      .getByRole("navigation")
      .getByRole("button", { name: "グループ", exact: true })
      .click();
    await pageA.getByRole("button", { name: "招待コードを再発行", exact: true }).click();
    await pageA.getByRole("button", { name: "再発行する", exact: true }).click();
    await expect(pageA.getByTestId("invite-code")).not.toHaveText(invite);
    const renewedInvite = await pageA.getByTestId("invite-code").innerText();
    await pageB.bringToFront();
    await expect(card).toHaveCount(1);
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "グループ", exact: true })
      .click();
    await pageB.getByRole("button", { name: "招待コードで参加", exact: true }).click();
    await pageB.getByLabel("招待コード", { exact: true }).fill(invite);
    await pageB.getByRole("button", { name: "グループに参加 →", exact: true }).click();
    await expect(pageB.getByRole("main").getByRole("alert")).toContainText(
      "招待コードに対応するグループが見つかりません",
    );
    await pageB.getByLabel("招待コード", { exact: true }).fill(renewedInvite);
    await pageB.getByRole("button", { name: "グループに参加 →", exact: true }).click();
    await expect(pageB.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(pageB.getByTestId("invite-code")).toHaveText(renewedInvite);
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "ホーム", exact: true })
      .click();
    await expect(card).toHaveCount(1);

    await pageA.bringToFront();
    await pageA.getByRole("navigation").getByRole("button", { name: "設定", exact: true }).click();
    await expect(pageA.getByLabel("表示名", { exact: true })).toHaveValue("共有テストA");
    await pageA.getByLabel("表示名", { exact: true }).fill("変更後のA");
    await pageA.route("**/api/me/profile", (route) => route.abort());
    await pageA.getByRole("button", { name: "表示名を変更", exact: true }).click();
    await expect(pageA.getByRole("alert").filter({ hasText: "表示名は更新済み" })).toBeVisible();
    await pageA.unroute("**/api/me/profile");
    await pageA.getByRole("button", { name: "共有記録への反映を再試行", exact: true }).click();
    await expect(pageA.getByRole("status").filter({ hasText: "反映を確認しました" })).toBeVisible();
    await pageB.bringToFront();
    await expect(card).toContainText("変更後のA");

    await pageA.bringToFront();
    await pageA.getByRole("button", { name: "ログアウト", exact: true }).click();
    await expect(pageA.getByRole("button", { name: "ログインする →", exact: true })).toBeVisible();
    await pageA.getByLabel("メールアドレス", { exact: true }).fill(emailA);
    await pageA.getByLabel("パスワード", { exact: true }).fill(testPassword);
    await pageA.getByRole("button", { name: "ログインする →", exact: true }).click();
    await pageA
      .getByRole("navigation")
      .getByRole("button", { name: "自分の記録", exact: true })
      .click();
    await expect(pageA.getByRole("article")).toHaveCount(1);
    await expect(pageA.getByRole("article")).toContainText("ケーブルロウ");
    const calendar = pageA.getByRole("region", { name: "活動カレンダー", exact: true });
    const recordedDay = calendar.getByRole("button", { name: /、2セット、1件$/ });
    await expect(recordedDay).toHaveCount(1);
    await recordedDay.click();
    await expect(pageA.getByRole("article")).toHaveCount(1);
    await expect(pageA.getByRole("article")).toContainText("ケーブルロウ");
    await pageA.getByRole("button", { name: "日付の絞り込みを解除", exact: true }).click();
    await pageB.bringToFront();
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "自分の記録", exact: true })
      .click();
    await expect(pageB.getByText("この月の記録はまだありません。", { exact: true })).toBeVisible();
    await expect(pageB.getByRole("article")).toHaveCount(0);
    await pageA.bringToFront();
    await pageA.getByRole("navigation").getByRole("button", { name: "設定", exact: true }).click();
    await expect(pageA.getByLabel("表示名", { exact: true })).toHaveValue("変更後のA");
    await pageA
      .getByRole("navigation")
      .getByRole("button", { name: "自分の記録", exact: true })
      .click();
    await pageA.getByRole("button", { name: "＋ トレーニングを記録", exact: true }).click();
    await pageA.getByLabel("種目名", { exact: true }).selectOption({ label: "ケーブルロウ" });
    await pageA.getByText("自分の種目リストを管理", { exact: true }).click();
    await pageA.getByRole("button", { name: "ケーブルロウをリストから削除", exact: true }).click();
    await pageA.getByRole("button", { name: "削除する", exact: true }).click();
    await expect(pageA.getByRole("status").filter({ hasText: "削除しました" })).toBeVisible();
    await pageA.getByRole("button", { name: "← 戻る（下書きは残ります）", exact: true }).click();
    await expect(pageA.getByRole("article")).toContainText("ケーブルロウ");
    await pageB.bringToFront();
    await expect(card).toContainText("ケーブルロウ");
    await pageB.getByRole("button", { name: "＋ トレーニングを記録", exact: true }).click();
    const otherOptions = pageB.getByLabel("種目名", { exact: true });
    await expect(otherOptions).toBeEnabled();
    await expect(otherOptions.locator("option", { hasText: "ケーブルロウ" })).toHaveCount(0);
    await otherOptions.selectOption({ label: "ベンチプレス" });
    await pageA.getByRole("button", { name: "編集", exact: true }).click();
    await pageA.getByLabel("種目1 セット1 重量", { exact: true }).fill("85");
    await pageA.getByRole("button", { name: "変更を保存 →", exact: true }).click();
    await expect(pageA.getByRole("status").filter({ hasText: "記録を更新しました" })).toBeVisible();
    await pageB.bringToFront();
    await expect(card).toContainText("85");
    await expect(pageB.getByRole("button", { name: "編集", exact: true })).toHaveCount(0);
    await pageA.bringToFront();
    await pageA.getByRole("button", { name: "削除", exact: true }).click();
    await expect(pageA.getByText("本人の履歴と共有先から削除され", { exact: false })).toBeVisible();
    await pageA.getByRole("button", { name: "記録を削除する", exact: true }).click();
    await expect(pageA.getByRole("article")).toHaveCount(0);
    await pageB.bringToFront();
    await expect(card).toHaveCount(0);
    await pageB.bringToFront();
    await pageB.getByRole("button", { name: "＋ トレーニングを記録", exact: true }).click();
    await pageB.getByLabel("種目名", { exact: true }).fill("退出テストのスクワット");
    await pageB.getByLabel("種目1 セット1 重量", { exact: true }).fill("60");
    await pageB.getByLabel("種目1 セット1 回数", { exact: true }).fill("8");
    await pageB.getByRole("button", { name: "記録を確定して共有 →", exact: true }).click();
    await expect(pageB.getByRole("status").filter({ hasText: "共有しました" })).toBeVisible();
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "グループ", exact: true })
      .click();
    await pageB.getByRole("button", { name: "グループから退出", exact: true }).click();
    await pageB.getByRole("button", { name: "退出する", exact: true }).click();
    await expect(
      pageB.getByRole("status").filter({ hasText: "グループを退出しました" }),
    ).toBeVisible();
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "自分の記録", exact: true })
      .click();
    await expect(pageB.getByRole("article")).toContainText("退出テストのスクワット");
    await expect(pageB.getByRole("article")).toContainText("自分だけの記録");
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "グループ", exact: true })
      .click();
    await pageB.getByRole("button", { name: "招待コードで参加", exact: true }).click();
    await pageB.getByLabel("招待コード", { exact: true }).fill(invite);
    await pageB.getByRole("button", { name: "グループに参加 →", exact: true }).click();
    await expect(pageB.getByTestId("invite-code")).toHaveText(invite);
    await pageA.bringToFront();
    await pageA
      .getByRole("navigation")
      .getByRole("button", { name: "グループ", exact: true })
      .click();
    await pageA.getByRole("button", { name: "共有テストBを除外", exact: true }).click();
    await pageA.getByRole("button", { name: "除外する", exact: true }).click();
    await expect(
      pageA.getByRole("status").filter({ hasText: "メンバーを除外しました" }),
    ).toBeVisible();
    await pageB.bringToFront();
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "ホーム", exact: true })
      .click();
    await expect(pageB.getByRole("article")).toHaveCount(0);
    await pageA.bringToFront();
    await pageA
      .getByRole("navigation")
      .getByRole("button", { name: "ホーム", exact: true })
      .click();
    await expect(pageA.getByRole("article")).toHaveCount(1);
    await expect(pageA.getByRole("article")).toContainText("ベンチプレス");
    await pageA.getByRole("button", { name: "この内容でもう一度", exact: true }).click();
    await pageA.getByRole("button", { name: "コピーして入力する", exact: true }).click();
    await expect(pageA.getByLabel("種目1 セット1 重量", { exact: true })).toHaveValue("82.5");
    await expect(pageA.getByRole("combobox", { name: "共有先", exact: true })).toHaveValue("");
    await pageA.getByRole("button", { name: "記録を保存 →", exact: true }).click();
    await expect(pageA.getByRole("article")).toHaveCount(2);
    await expect(pageA.getByRole("article").filter({ hasText: "自分だけの記録" })).toHaveCount(1);
    await pageB.bringToFront();
    await pageB.reload();
    await expect(pageB.getByRole("article")).toHaveCount(1);

    await pageA.getByRole("button", { name: "自分用メモ", exact: true }).click();
    await pageA
      .getByLabel("メモ（1000文字まで）", { exact: true })
      .fill("本人だけの振り返りテスト");
    await pageA.getByRole("button", { name: "メモを保存", exact: true }).click();
    await expect(
      pageA.getByRole("status").filter({ hasText: "自分用メモを保存しました" }),
    ).toBeVisible();
    await pageA.getByRole("button", { name: "閉じる", exact: true }).click();
    await pageA.getByRole("button", { name: "自分用メモ", exact: true }).click();
    await expect(pageA.getByLabel("メモ（1000文字まで）", { exact: true })).toHaveValue(
      "本人だけの振り返りテスト",
    );
    await pageB.bringToFront();
    await pageB.reload();
    await expect(pageB.getByRole("article")).toHaveCount(1);
    await expect(pageB.getByText("本人だけの振り返りテスト")).toHaveCount(0);
    await expect(pageB.getByRole("button", { name: "自分用メモ", exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
  }
});
