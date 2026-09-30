import { expect, test } from "./fixtures";
import {
  mockTraining,
  navigate,
  openRecordingCatalog,
  openTraining,
  startTraining,
} from "./mock-training";

test("種目追加と削除の失敗を再試行し、削除しても記録入力を保持する", async ({ page }) => {
  const state = await mockTraining(page, true, false, false);
  await startTraining(page, "スクワット");
  await openRecordingCatalog(page);
  const name = page.getByLabel("新しい種目", { exact: true });
  await name.fill(" ケーブルロウ ");
  state.failOptionWrite = true;
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("通信できません");
  await expect(name).toHaveValue(" ケーブルロウ ");
  state.failOptionWrite = false;
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.locator(".exercise-picker-list")).toContainText("ケーブルロウ");
  await page
    .locator(".exercise-picker-list")
    .getByRole("button", { name: /^ケーブルロウ/ })
    .click();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("30");
  await navigate(page, "設定");
  await page.getByRole("button", { name: "種目を管理", exact: true }).click();
  await page.getByRole("button", { name: "ケーブルロウをリストから削除", exact: true }).click();
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  expect(state.options.some((option) => option.name === "ケーブルロウ")).toBe(true);
  await page.getByRole("button", { name: "ケーブルロウをリストから削除", exact: true }).click();
  state.failOptionWrite = true;
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("通信できません");
  state.failOptionWrite = false;
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page.locator(".exercise-options")).not.toContainText("ケーブルロウ");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.reload();
  await openTraining(page);
  await expect(page.locator(".exercise-information")).toHaveText("ケーブルロウ");
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("30");
  expect(state.saves).toBe(0);
});

test("候補取得失敗を再試行し、空リストから追加した種目を選べる", async ({ page }) => {
  const state = await mockTraining(page, true, false, false);
  state.failOptions = true;
  await page.reload();
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("通信できません");
  state.failOptions = false;
  state.options = [];
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByText("この部位の種目はありません", { exact: true })).toBeVisible();
  await openRecordingCatalog(page);
  await page.getByLabel("新しい種目", { exact: true }).fill("新しい種目");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await page
    .locator(".exercise-picker-list")
    .getByRole("button", { name: /^新しい種目/ })
    .click();
  await expect(page.locator(".exercise-information")).toHaveText("新しい種目");
});

test("空白と長すぎる名前を送信せず、種目ごとにセットを記録できる", async ({ page }) => {
  const state = await mockTraining(page, true, false, false);
  await startTraining(page);
  await openRecordingCatalog(page);
  for (const value of ["   ", "長".repeat(61)]) {
    await page.getByLabel("新しい種目", { exact: true }).fill(value);
    await page.getByRole("button", { name: "追加", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("1〜60文字");
    expect(state.options).toHaveLength(2);
  }
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page
    .locator(".exercise-picker-list")
    .getByRole("button", { name: /^ベンチプレス/ })
    .click();
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect.poll(() => state.session?.exercises[0]?.sets.length).toBe(1);
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  await page
    .locator(".exercise-picker-list")
    .getByRole("button", { name: /^スクワット/ })
    .click();
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect
    .poll(() => state.session?.exercises.map((exercise) => exercise.name))
    .toEqual(["ベンチプレス", "スクワット"]);
});
