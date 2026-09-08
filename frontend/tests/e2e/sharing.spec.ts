import { type Page, expect, test } from "@playwright/test";
import { createTestUser, testPassword } from "./local-auth";

async function login(page: Page, name: string, email: string) {
  await createTestUser(name, email);
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.getByRole("button", { name: "スキップ", exact: true }).click();
}

test("2人がグループへ参加し、記録を共有して再ログイン後も参照できる", async ({ browser }) => {
  test.setTimeout(150_000);
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
    await pageA.getByRole("button", { name: "作成する", exact: true }).click();
    const code = pageA.getByTestId("invite-code");
    await expect(code).toBeVisible();
    const invite = await code.innerText();

    await login(pageB, "共有テストB", `gotore-${run}-b@example.test`);
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "グループ", exact: true })
      .click();
    await pageB.getByRole("button", { name: "参加", exact: true }).click();
    await pageB.getByLabel("招待コード", { exact: true }).fill(invite);
    await pageB.getByRole("button", { name: "参加する", exact: true }).click();
    await expect(pageB.getByTestId("invite-code")).toHaveText(invite);
    await expect(pageB.getByLabel("変更後の名前", { exact: true })).toHaveCount(0);
    await pageA.getByLabel("変更後の名前", { exact: true }).fill("夜の合トレ部");
    await pageA.route("**/api/groups/*", (route) => {
      if (route.request().method() === "PATCH") return route.abort();
      return route.continue();
    });
    await pageA.getByRole("button", { name: "変更する", exact: true }).click();
    await expect(pageA.getByRole("alert").filter({ hasText: "通信できません" })).toBeVisible();
    await expect(pageA.getByLabel("変更後の名前", { exact: true })).toHaveValue("夜の合トレ部");
    await pageA.unroute("**/api/groups/*");
    await pageA.getByRole("button", { name: "変更する", exact: true }).click();
    await expect(pageA.getByRole("heading", { name: "夜の合トレ部", exact: true })).toBeVisible();
    await expect(pageA.getByTestId("invite-code")).toHaveText(invite);
    await pageB.bringToFront();
    await expect(pageB.getByRole("heading", { name: "夜の合トレ部", exact: true })).toBeVisible();
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "ホーム", exact: true })
      .click();

    await pageA.bringToFront();
    await pageA.getByRole("button", { name: "＋ 記録する", exact: true }).click();
    await pageA.getByText("種目リスト", { exact: true }).click();
    await pageA.getByLabel("新しい種目", { exact: true }).fill("ケーブルロウ");
    await pageA.getByRole("button", { name: "追加", exact: true }).click();
    await expect(pageA.getByRole("status").filter({ hasText: "追加しました" })).toBeVisible();
    await pageA.getByLabel("種目名", { exact: true }).selectOption({ label: "ケーブルロウ" });
    await pageA.getByLabel("種目1 セット1 重量", { exact: true }).fill("82.5");
    await pageA.getByLabel("種目1 セット1 回数", { exact: true }).fill("8");
    await pageA.getByRole("button", { name: "＋ セット", exact: true }).click();
    await pageA.getByLabel("種目1 セット2 重量", { exact: true }).fill("80");
    await pageA.getByLabel("種目1 セット2 回数", { exact: true }).fill("10");
    await pageA.getByRole("button", { name: "← 戻る", exact: true }).click();
    await pageA.reload();
    await pageA.getByRole("button", { name: "＋ 記録する", exact: true }).click();
    await expect(pageA.getByLabel("種目1 セット1 重量", { exact: true })).toHaveValue("82.5");
    await expect(
      pageA.getByRole("combobox", { name: "共有先", exact: true }).locator("option:checked"),
    ).toHaveText("夜の合トレ部");

    // 一度だけ通信を失敗させ、入力を失わず同じ記録を再送できることを確認する。
    await pageA.route("**/api/workouts", (route) => route.abort(), {
      times: 1,
    });
    await pageA.getByRole("button", { name: "保存して共有", exact: true }).click();
    await expect(pageA.getByRole("alert").filter({ hasText: "通信できません" })).toBeVisible();
    await expect(pageA.getByLabel("種目1 セット1 重量", { exact: true })).toHaveValue("82.5");
    await pageA.getByRole("button", { name: "保存して共有", exact: true }).click();
    await expect(pageA.getByRole("status").filter({ hasText: "共有しました" })).toBeVisible();

    await pageB.bringToFront();
    await expect(pageB.getByRole("article").filter({ hasText: "ケーブルロウ" })).toHaveCount(1);
    const card = pageB.getByRole("article").filter({ hasText: "ケーブルロウ" });
    await expect(card).toContainText("共有テストA");
    await card.getByText("セット詳細", { exact: true }).click();
    await expect(card).toContainText("82.5");
    await expect(card).toContainText("共有済み");
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
    await pageA.getByRole("button", { name: "再発行", exact: true }).click();
    await pageA.getByRole("button", { name: "再発行する", exact: true }).click();
    await expect(pageA.getByTestId("invite-code")).not.toHaveText(invite);
    const renewedInvite = await pageA.getByTestId("invite-code").innerText();
    await pageB.bringToFront();
    await expect(card).toHaveCount(1);
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "グループ", exact: true })
      .click();
    await pageB.getByRole("button", { name: "参加", exact: true }).click();
    await pageB.getByLabel("招待コード", { exact: true }).fill(invite);
    await pageB.getByRole("button", { name: "参加する", exact: true }).click();
    await expect(pageB.getByRole("main").getByRole("alert")).toContainText("招待コードが無効です");
    await pageB.getByLabel("招待コード", { exact: true }).fill(renewedInvite);
    await pageB.getByRole("button", { name: "参加する", exact: true }).click();
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
    await pageA.getByRole("button", { name: "保存", exact: true }).click();
    await expect(pageA.getByRole("alert").filter({ hasText: "表示名は更新済み" })).toBeVisible();
    await pageA.unroute("**/api/me/profile");
    await pageA.getByRole("button", { name: "再試行", exact: true }).click();
    await expect(pageA.getByRole("status").filter({ hasText: "反映しました" })).toBeVisible();
    await pageB.bringToFront();
    await expect(card).toContainText("変更後のA");

    await pageA.bringToFront();
    await pageA.getByRole("button", { name: "ログアウト", exact: true }).click();
    await expect(pageA.getByRole("button", { name: "ログイン", exact: true })).toBeVisible();
    await pageA.getByLabel("メールアドレス", { exact: true }).fill(emailA);
    await pageA.getByLabel("パスワード", { exact: true }).fill(testPassword);
    await pageA.getByRole("button", { name: "ログイン", exact: true }).click();
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
    await pageA.getByRole("button", { name: "すべての記録", exact: true }).click();
    await pageB.bringToFront();
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "自分の記録", exact: true })
      .click();
    await expect(pageB.getByText("この月は記録なし", { exact: true })).toBeVisible();
    await expect(pageB.getByRole("article")).toHaveCount(0);
    await pageA.bringToFront();
    await pageA.getByRole("navigation").getByRole("button", { name: "設定", exact: true }).click();
    await expect(pageA.getByLabel("表示名", { exact: true })).toHaveValue("変更後のA");
    await pageA
      .getByRole("navigation")
      .getByRole("button", { name: "自分の記録", exact: true })
      .click();
    await pageA.getByRole("button", { name: "＋ 記録する", exact: true }).click();
    await pageA.getByLabel("種目名", { exact: true }).selectOption({ label: "ケーブルロウ" });
    await pageA.getByText("種目リスト", { exact: true }).click();
    await pageA.getByRole("button", { name: "ケーブルロウをリストから削除", exact: true }).click();
    await pageA.getByRole("button", { name: "削除する", exact: true }).click();
    await expect(pageA.getByRole("status").filter({ hasText: "削除しました" })).toBeVisible();
    await pageA.getByRole("button", { name: "← 戻る", exact: true }).click();
    await pageA
      .getByRole("navigation")
      .getByRole("button", { name: "自分の記録", exact: true })
      .click();
    await expect(pageA.getByRole("article")).toContainText("ケーブルロウ");
    await pageB.bringToFront();
    await pageB
      .getByRole("navigation")
      .getByRole("button", { name: "ホーム", exact: true })
      .click();
    await expect(card).toContainText("ケーブルロウ");
    await pageB.getByRole("button", { name: "＋ 記録する", exact: true }).click();
    const otherOptions = pageB.getByLabel("種目名", { exact: true });
    await expect(otherOptions).toBeEnabled();
    await expect(otherOptions.locator("option", { hasText: "ケーブルロウ" })).toHaveCount(0);
    await otherOptions.selectOption({ label: "ベンチプレス" });
    await pageB.getByRole("button", { name: "← 戻る", exact: true }).click();
    const nav = async (page: Page, name: string) => {
      await page.bringToFront();
      await page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
    };
    await nav(pageA, "自分の記録");
    const shared = pageA.getByRole("article").filter({ hasText: "共有済み" });
    await shared.getByRole("button", { name: "メモ", exact: true }).click();
    await shared.getByLabel("メモ", { exact: true }).fill("本人だけの振り返りテスト");
    await shared.getByRole("button", { name: "保存", exact: true }).click();
    await expect(shared.getByRole("status")).toContainText("保存しました");
    await shared.getByRole("button", { name: "閉じる", exact: true }).click();
    await shared.getByRole("button", { name: "メモ", exact: true }).click();
    await expect(shared.getByLabel("メモ", { exact: true })).toHaveValue(
      "本人だけの振り返りテスト",
    );
    await shared.getByRole("button", { name: "閉じる", exact: true }).click();
    await pageB.bringToFront();
    await pageB.reload();
    await expect(card).toHaveCount(1);
    await expect(pageB.getByText("本人だけの振り返りテスト")).toHaveCount(0);
    await expect(pageB.getByRole("button", { name: "メモ", exact: true })).toHaveCount(0);

    await pageA.bringToFront();
    await shared.getByRole("button", { name: "コピー", exact: true }).click();
    await shared.getByRole("button", { name: "コピーする", exact: true }).click();
    await expect(pageA.getByLabel("種目1 セット1 重量", { exact: true })).toHaveValue("82.5");
    await expect(pageA.getByRole("combobox", { name: "共有先", exact: true })).toHaveValue("");
    await pageA.getByRole("button", { name: "保存", exact: true }).click();
    await expect(pageA.getByRole("article")).toHaveCount(2);
    const personal = pageA.getByRole("article").filter({ hasText: "自分だけ" });
    await expect(personal).toHaveCount(1);
    await expect(calendar.getByRole("button", { name: /、4セット、2件$/ })).toHaveCount(1);
    await pageB.bringToFront();
    await expect(card).toHaveCount(1);

    await pageA.bringToFront();
    await shared.getByRole("button", { name: "編集", exact: true }).click();
    await pageA.getByLabel("種目1 セット1 重量", { exact: true }).fill("85");
    await pageA.getByRole("button", { name: "保存", exact: true }).click();
    await expect(pageA.getByRole("status").filter({ hasText: "更新しました" })).toBeVisible();
    await shared.getByRole("button", { name: "メモ", exact: true }).click();
    await expect(shared.getByLabel("メモ", { exact: true })).toHaveValue(
      "本人だけの振り返りテスト",
    );
    await shared.getByRole("button", { name: "閉じる", exact: true }).click();
    await pageB.bringToFront();
    await card.getByText("セット詳細", { exact: true }).click();
    await expect(card).toContainText("85");
    await expect(pageB.getByRole("button", { name: "編集", exact: true })).toHaveCount(0);
    await pageA.bringToFront();
    await shared.getByRole("button", { name: "削除", exact: true }).click();
    await expect(shared.getByText("この記録を削除しますか？", { exact: true })).toBeVisible();
    await shared.getByRole("button", { name: "削除する", exact: true }).click();
    await expect(pageA.getByRole("article")).toHaveCount(1);
    await expect(personal).toHaveCount(1);
    await expect(calendar.getByRole("button", { name: /、2セット、1件$/ })).toHaveCount(1);
    await pageB.bringToFront();
    await expect(card).toHaveCount(0);

    await pageB.getByRole("button", { name: "＋ 記録する", exact: true }).click();
    await pageB.getByLabel("種目名", { exact: true }).selectOption({ label: "スクワット" });
    await pageB.getByLabel("種目1 セット1 重量", { exact: true }).fill("60");
    await pageB.getByLabel("種目1 セット1 回数", { exact: true }).fill("8");
    await pageB.getByRole("button", { name: "保存して共有", exact: true }).click();
    await expect(pageB.getByRole("status").filter({ hasText: "共有しました" })).toBeVisible();
    await nav(pageB, "グループ");
    await pageB.getByRole("button", { name: "退出", exact: true }).click();
    await pageB.getByRole("button", { name: "退出する", exact: true }).click();
    await expect(pageB.getByRole("status").filter({ hasText: "退出しました" })).toBeVisible();
    await nav(pageB, "自分の記録");
    await expect(pageB.getByRole("article")).toContainText("スクワット");
    await expect(pageB.getByRole("article")).toContainText("自分だけ");
    await nav(pageB, "グループ");
    await pageB.getByRole("button", { name: "参加", exact: true }).click();
    await pageB.getByLabel("招待コード", { exact: true }).fill(renewedInvite);
    await pageB.getByRole("button", { name: "参加する", exact: true }).click();
    await expect(pageB.getByTestId("invite-code")).toHaveText(renewedInvite);
    await nav(pageA, "グループ");
    await pageA.getByRole("button", { name: "共有テストBを除外", exact: true }).click();
    await pageA.getByRole("button", { name: "除外する", exact: true }).click();
    await expect(pageA.getByRole("status").filter({ hasText: "除外しました" })).toBeVisible();
    for (const page of [pageB, pageA]) {
      await nav(page, "ホーム");
      await expect(page.getByRole("article")).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
  }
});
