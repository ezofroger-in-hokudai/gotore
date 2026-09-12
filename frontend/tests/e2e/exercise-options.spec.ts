import { expect, test } from "@playwright/test";
import { mockTraining, navigate, openTraining, startTraining } from "./mock-training";

async function catalog(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "種目一覧", exact: true }).click();
}
test("種目追加・削除の失敗を再試行でき、削除後も入力を保持する", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page, "スクワット");
  await catalog(page);
  const name = page.getByLabel("新しい種目", { exact: true });
  await name.fill(" ケーブルロウ ");
  state.failOptionWrite = true;
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("通信できません");
  await expect(name).toHaveValue(" ケーブルロウ ");
  state.failOptionWrite = false;
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("追加しました");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "種目を変更", exact: true }).click();
  await page.getByRole("button", { name: /^ケーブルロウ/ }).click();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("30");
  await catalog(page);
  await page.getByRole("button", { name: "ケーブルロウをリストから削除", exact: true }).click();
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  expect(state.options.some((e) => e.name === "ケーブルロウ")).toBe(true);
  await page.getByRole("button", { name: "ケーブルロウをリストから削除", exact: true }).click();
  state.failOptionWrite = true;
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("通信できません");
  state.failOptionWrite = false;
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("削除しました");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.reload();
  await openTraining(page);
  await expect(page.getByRole("heading", { name: "ケーブルロウ", exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("30");
  expect(state.saves).toBe(0);
});

test("候補取得失敗から再試行し、空リストにも追加できる", async ({ page }) => {
  const state = await mockTraining(page);
  state.failOptions = true;
  await page.reload();
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("通信できません");
  state.failOptions = false;
  state.options = [];
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(
    page.getByText("種目一覧から種目を追加してください。", { exact: true }),
  ).toBeVisible();
  await catalog(page);
  await page.getByLabel("新しい種目", { exact: true }).fill("新しい種目");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("追加しました");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page
    .locator(".v2-rows")
    .getByRole("button", { name: /^新しい種目/ })
    .click();
  await expect(page.getByRole("heading", { name: "新しい種目", exact: true })).toBeVisible();
});

test("空白・長すぎる名前を送信せず、種目ごとにセットを記録できる", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await catalog(page);
  for (const value of ["   ", "長".repeat(61)]) {
    await page.getByLabel("新しい種目", { exact: true }).fill(value);
    await page.getByRole("button", { name: "追加", exact: true }).click();
    await expect(page.locator(".v2-app").getByRole("alert")).toContainText("1〜60文字");
    expect(state.options).toHaveLength(2);
  }
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.getByText("保存しました", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "種目を変更", exact: true }).click();
  await page.getByRole("button", { name: /^スクワット/ }).click();
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.getByText("保存しました", { exact: true })).toBeVisible();
  expect(state.session?.exercises.map((e) => e.name)).toEqual(["ベンチプレス", "スクワット"]);
});
