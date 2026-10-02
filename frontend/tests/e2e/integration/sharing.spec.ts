import { type Page, expect, test } from "../fixtures";
import { createTestUser, testPassword } from "../local-auth";
import { navigate, openTraining, startTraining } from "../mock-training";
import { openHistoryDay } from "../personal-history-helper";

async function login(page: Page, name: string, email: string) {
  await createTestUser(name, email);
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "スキップ", exact: true }).click();
}
async function createGroup(page: Page, name: string) {
  await navigate(page, "グループ");
  await page.getByRole("button", { name: "作成", exact: true }).click();
  await page.getByLabel("グループ名", { exact: true }).fill(name);
  const inviteResponse = page.waitForResponse(
    (response) => response.url().includes("/invites") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "作成する", exact: true }).click();
  await expect(page.getByRole("heading", { name: "メンバーを招待", exact: true })).toBeVisible();
  const response = await inviteResponse;
  expect(response.ok()).toBe(true);
  const token = (await response.json()).token as string;
  expect(token.length).toBeGreaterThan(40);
  await page.getByRole("button", { name: "完了", exact: true }).click();
  return token;
}
async function join(page: Page, token: string, name: string) {
  await navigate(page, "グループ");
  await page.getByRole("button", { name: "参加", exact: true }).click();
  await page
    .getByLabel("招待リンク", { exact: true })
    .fill(`http://localhost/?groupInvite=${token}`);
  await page.getByRole("button", { name: "リンクを確認", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByText("参加後の記録から共有されます")).toBeVisible();
  await page.getByRole("button", { name: "このグループに参加", exact: true }).click();
  await expect(page.getByRole("button", { name: "このグループに参加" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("2人・2グループで全共有、再開、LIVE終了、本人メモ、退出後の非再共有を確認する", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const run = crypto.randomUUID();
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const b = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  const errors: string[] = [];
  for (const page of [pageA, pageB]) page.on("pageerror", (error) => errors.push(error.message));
  try {
    await login(pageA, "共有テストA", `gotore-${run}-a@example.test`);
    const first = await createGroup(pageA, "朝の合トレ部");
    const second = await createGroup(pageA, "週末の合トレ部");
    await login(pageB, "共有テストB", `gotore-${run}-b@example.test`);
    await join(pageB, first, "朝の合トレ部");
    await join(pageB, second, "週末の合トレ部");
    await navigate(pageB, "ホーム");
    await pageA.bringToFront();
    await startTraining(pageA, "ベンチプレス");
    await pageA.getByRole("spinbutton", { name: "重量", exact: true }).fill("82.5");
    await pageA.getByRole("spinbutton", { name: "回数", exact: true }).fill("8");
    let failSave = true;
    await pageA.route("**/api/sessions/*", (route) =>
      route.request().method() === "PATCH" && failSave ? route.abort() : route.continue(),
    );
    await pageA.getByRole("button", { name: "セットを追加", exact: true }).click();
    await expect(pageA.getByRole("button", { name: "セット1を編集", exact: true })).toContainText(
      "82.5",
    );
    failSave = false;
    const savedResponse = pageA.waitForResponse(
      (response) =>
        response.url().includes("/sessions/") &&
        response.request().method() === "PATCH" &&
        response.ok(),
    );
    await pageA.evaluate(() => window.dispatchEvent(new Event("online")));
    expect((await savedResponse).ok()).toBe(true);
    await pageA.reload();
    await openTraining(pageA);
    await expect(pageA.getByRole("button", { name: "セット1を編集", exact: true })).toContainText(
      "82.5",
    );
    await pageB.bringToFront();
    for (const name of ["朝の合トレ部", "週末の合トレ部"]) {
      await pageB.getByRole("button", { name, exact: true }).click();
      await expect(pageB.getByRole("article")).toContainText("82.5");
      await expect(pageB.getByRole("article")).toContainText("共有テストA");
      await expect(pageB.getByRole("article").locator(".record-table tbody tr")).toHaveCount(1);
    }
    await pageA.bringToFront();
    await pageA.getByRole("button", { name: "トレーニング終了", exact: true }).click();
    const finishedResponse = pageA.waitForResponse(
      (response) =>
        response.url().includes("/finish") &&
        response.request().method() === "POST" &&
        response.ok(),
    );
    await pageA.getByRole("button", { name: "終了する", exact: true }).click();
    const finished = await (await finishedResponse).json();
    const day = await openHistoryDay(pageA, finished.performed_on);
    await expect(day.getByRole("article")).toHaveCount(1);
    await pageA.getByRole("button", { name: "メモ", exact: true }).click();
    await pageA.getByLabel("メモ", { exact: true }).fill("本人だけの振り返り");
    const memoSaved = pageA.waitForResponse(
      (response) =>
        /^\/api\/workouts\/[^/]+\/memo$/.test(new URL(response.url()).pathname) &&
        response.request().method() === "PUT" &&
        response.ok(),
    );
    await pageA.getByRole("button", { name: "保存", exact: true }).click();
    expect((await (await memoSaved).json()).content).toBe("本人だけの振り返り");
    await expect(
      pageA.getByRole("article").getByRole("button", { name: "メモ", exact: true }),
    ).toBeVisible();
    await day.getByRole("button", { name: "編集", exact: true }).click();
    await pageA.getByLabel("種目1 セット1 重量", { exact: true }).fill("85");
    const updated = pageA.waitForResponse(
      (response) =>
        response.url().includes("/workouts/") &&
        response.request().method() === "PATCH" &&
        response.ok(),
    );
    await pageA.getByRole("button", { name: "保存", exact: true }).click();
    expect((await updated).ok()).toBe(true);
    await pageB.bringToFront();
    await expect(pageB.getByRole("article")).toContainText("85");
    await expect(pageB.getByText("本人だけの振り返り")).toHaveCount(0);
    await expect(pageB.getByRole("button", { name: "メモ", exact: true })).toHaveCount(0);
    await expect(pageB.getByRole("article").locator(".record-table tbody tr")).toContainText("85");
    await expect(pageB.getByRole("article")).not.toContainText("本人だけの振り返り");
    await expect(
      pageB.getByRole("article").getByRole("button", { name: /^(メモ|編集|削除)$/ }),
    ).toHaveCount(0);
    await startTraining(pageB, "スクワット");
    await pageB.getByRole("button", { name: "セットを追加", exact: true }).click();
    await expect(pageB.getByRole("heading", { name: "SET 2" })).toBeVisible();
    await navigate(pageB, "ホーム");
    await navigate(pageB, "グループ");
    await pageB.getByRole("button", { name: "朝の合トレ部の詳細", exact: true }).click();
    await pageB
      .getByRole("navigation", { name: "グループの表示" })
      .getByRole("button", { name: "設定", exact: true })
      .click();
    await pageB.getByRole("button", { name: "グループから抜ける", exact: true }).click();
    await pageB.getByRole("button", { name: "抜ける", exact: true }).click();
    await expect(pageB.getByRole("heading", { name: "グループ", exact: true })).toBeVisible();
    await navigate(pageA, "グループ");
    await pageA.getByRole("button", { name: "朝の合トレ部の詳細", exact: true }).click();
    const refreshedInvite = pageA.waitForResponse(
      (response) => response.url().includes("/invites") && response.request().method() === "POST",
    );
    await pageA.getByRole("button", { name: /招待/ }).click();
    const newToken = (await (await refreshedInvite).json()).token as string;
    await pageA.getByRole("button", { name: "完了", exact: true }).click();
    await join(pageB, newToken, "朝の合トレ部");
    await navigate(pageB, "ホーム");
    await pageB.getByRole("button", { name: "朝の合トレ部", exact: true }).click();
    await expect(pageB.getByRole("article")).toHaveCount(1);
    await expect(pageB.getByRole("article")).toContainText("共有テストA");
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
  }
});
