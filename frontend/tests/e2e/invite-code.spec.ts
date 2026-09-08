import { expect, test } from "@playwright/test";
import { mockTraining } from "./mock-training";

test("オーナーは影響を確認して再発行でき、失敗時は再取得できる", async ({ page }, testInfo) => {
  const duplicateKeys: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Encountered two children")) duplicateKeys.push(message.text());
  });
  const state = await mockTraining(page);
  let fail = true;
  let requests = 0;
  await page.route(`**/api/groups/${state.group.id}/invite-code`, (route) => {
    requests++;
    expect(route.request().postDataJSON()).toEqual({ expected_invite_code: "ABCDEF123456" });
    if (fail) return route.abort();
    state.group.invite_code = "FEDCBA654321";
    return route.fulfill({ json: state.group });
  });
  await page.getByRole("navigation").getByRole("button", { name: "グループ", exact: true }).click();
  await page.getByRole("button", { name: "再発行", exact: true }).click();
  await expect(
    page.getByText("古いコードは無効になります。", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "再発行", exact: true }).click();
  await page.getByRole("button", { name: "再発行する", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("通信できませんでした");
  await expect(page.getByTestId("invite-code")).toHaveText("ABCDEF123456");
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(page.getByRole("button", { name: "コピー", exact: true })).toBeDisabled();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("再取得してください");
  await page.getByRole("button", { name: "再取得", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "再発行", exact: true }).click();
  await page.getByRole("button", { name: "再発行する", exact: true }).click();
  await expect(page.getByTestId("invite-code")).toHaveText("FEDCBA654321");
  await expect(page.getByRole("main")).toContainText("再発行しました。");
  expect(requests).toBe(2);
  expect(duplicateKeys).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("invite-code-mobile.png") });
});

test("通常メンバーはコードを見られるが再発行できない", async ({ page }) => {
  await mockTraining(page, false);
  await page.getByRole("navigation").getByRole("button", { name: "グループ", exact: true }).click();
  await expect(page.getByTestId("invite-code")).toHaveText("ABCDEF123456");
  await expect(page.getByRole("button", { name: "再発行", exact: true })).toHaveCount(0);
});
