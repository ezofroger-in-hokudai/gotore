import { type Page, expect, test } from "@playwright/test";
import { createTestUser, testPassword } from "./local-auth";
import { navigate, openTraining, startTraining } from "./mock-training";

async function login(page: Page, name: string, email: string) {
  await createTestUser(name, email);
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "スキップ", exact: true }).click();
}
async function createGroup(page: Page, name: string) {
  await navigate(page, "ホーム");
  await page.getByRole("button", { name: "グループ一覧", exact: true }).click();
  await page.getByRole("button", { name: "グループを作成", exact: true }).click();
  await page.getByLabel("グループ名", { exact: true }).fill(name);
  await page.getByRole("button", { name: "作成する", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByTestId("invite-code")).toHaveText(/^[A-F0-9]{12}$/);
  return page.getByTestId("invite-code").innerText();
}
async function join(page: Page, code: string, name: string) {
  await navigate(page, "ホーム");
  await page.getByRole("button", { name: "グループ一覧", exact: true }).click();
  await page.getByRole("button", { name: "招待コードで参加", exact: true }).click();
  await page.getByLabel("招待コード", { exact: true }).fill(code);
  await page.getByRole("button", { name: "グループを確認", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(name);
  await page.getByRole("button", { name: "参加する", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
    await pageA.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await expect(pageA.locator(".sync-status")).toContainText("未送信");
    failSave = false;
    // 自動再送も許容し、先に同期が完了してボタンが消えても保存結果を確認する。
    await expect(pageA.locator(".sync-status")).toContainText("同期済み");
    await pageA.reload();
    await openTraining(pageA);
    await expect(pageA.getByRole("button", { name: "セット1を編集", exact: true })).toContainText(
      "82.5",
    );
    await pageB.bringToFront();
    for (const name of ["朝の合トレ部", "週末の合トレ部"]) {
      await pageB.getByRole("button", { name: `${name}を表示`, exact: true }).click();
      await expect(pageB.getByRole("article")).toContainText("82.5");
      await expect(pageB.getByRole("article")).toContainText("共有テストA");
      const detailResponse = pageB.waitForResponse(
        (response) =>
          /\/api\/groups\/[^/]+\/workouts\/[^/]+$/.test(response.url()) &&
          response.request().method() === "GET",
      );
      await pageB.getByRole("button", { name: "共有テストAの記録詳細を開く", exact: true }).click();
      const detail = pageB.getByRole("dialog", { name: "記録の詳細", exact: true });
      await expect(detail.locator(".record-set")).toHaveCount(1);
      await expect(detail).toContainText("82.5");
      expect((await (await detailResponse).json()).shared_group_ids).toHaveLength(1);
      await detail.getByRole("button", { name: "閉じる", exact: true }).click();
    }
    await pageA.bringToFront();
    await pageA.getByRole("button", { name: "トレーニング終了", exact: true }).click();
    await pageA.getByRole("button", { name: "終了する", exact: true }).click();
    await navigate(pageA, "履歴");
    await expect(pageA.locator(".history-row")).toHaveCount(1);
    await pageA.locator(".history-row").click();
    await pageA.getByRole("button", { name: "メモ", exact: true }).click();
    await pageA.getByLabel("メモ", { exact: true }).fill("本人だけの振り返り");
    await pageA.getByRole("button", { name: "保存", exact: true }).click();
    await expect(pageA.getByRole("status")).toContainText("保存しました");
    await pageA.getByRole("button", { name: "閉じる", exact: true }).click();
    await pageA.getByRole("button", { name: "編集", exact: true }).click();
    await pageA.getByLabel("種目1 セット1 重量", { exact: true }).fill("85");
    await pageA.getByRole("button", { name: "保存", exact: true }).click();
    await pageB.bringToFront();
    await expect(pageB.getByRole("article")).toContainText("85");
    await expect(pageB.getByText("本人だけの振り返り")).toHaveCount(0);
    await expect(pageB.getByRole("button", { name: "メモ", exact: true })).toHaveCount(0);
    await pageB.getByRole("button", { name: "共有テストAの記録詳細を開く", exact: true }).click();
    const detail = pageB.getByRole("dialog", { name: "記録の詳細", exact: true });
    await expect(detail.locator(".record-set")).toContainText("85");
    await expect(detail).not.toContainText("本人だけの振り返り");
    await expect(detail.getByRole("button", { name: /^(メモ|編集|削除)$/ })).toHaveCount(0);
    await detail.getByRole("button", { name: "閉じる", exact: true }).click();
    await startTraining(pageB, "スクワット");
    await pageB.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await expect(pageB.getByText("保存しました", { exact: true })).toBeVisible();
    await navigate(pageB, "ホーム");
    await pageB.getByRole("button", { name: "朝の合トレ部の詳細", exact: true }).click();
    await pageB.getByRole("button", { name: /^メンバー一覧/ }).click();
    await pageB.getByRole("button", { name: "退出", exact: true }).click();
    await pageB.getByRole("button", { name: "退出する", exact: true }).click();
    await expect(pageB.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible();
    await join(pageB, first, "朝の合トレ部");
    await navigate(pageB, "ホーム");
    await pageB.getByRole("button", { name: "朝の合トレ部を表示", exact: true }).click();
    await expect(pageB.getByRole("article")).toHaveCount(1);
    await expect(pageB.getByRole("article")).toContainText("共有テストA");
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
  }
});
