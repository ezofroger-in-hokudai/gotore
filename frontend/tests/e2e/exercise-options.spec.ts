import { expect, test } from "@playwright/test";
import { mockTraining } from "./mock-training";

test("本人の種目リストを追加・選択・削除し、下書きと失敗時の入力を保持する", async ({ page }) => {
  const state = await mockTraining(page);
  let submissions = 0;
  await page.route("**/api/workouts", (route) => {
    if (route.request().method() === "POST") submissions++;
    return route.fulfill({ status: 500, json: { detail: "保存失敗の確認" } });
  });
  await page.getByRole("button", { name: "＋ 記録する", exact: true }).click();
  const exercise = page.getByRole("combobox", { name: "種目名", exact: true });
  await expect(exercise).toBeVisible();
  await exercise.selectOption({ label: "スクワット" });
  await page.getByText("種目リスト", { exact: true }).click();
  const name = page.getByLabel("新しい種目", { exact: true });
  await name.fill(" ケーブルロウ ");
  state.failOptionWrite = true;
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "通信できません" })).toBeVisible();
  await expect(name).toHaveValue(" ケーブルロウ ");
  state.failOptionWrite = false;
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "追加しました" })).toBeVisible();
  await exercise.selectOption({ label: "ケーブルロウ" });
  await page.screenshot({ path: "test-results/exercise-catalog-mobile.png", fullPage: true });
  await page.getByLabel("種目1 セット1 重量", { exact: true }).fill("30");
  await page.getByLabel("種目1 セット1 回数", { exact: true }).fill("12");
  await page.getByRole("button", { name: "ケーブルロウをリストから削除", exact: true }).click();
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(exercise).toHaveValue("ケーブルロウ");
  await page.getByRole("button", { name: "ケーブルロウをリストから削除", exact: true }).click();
  state.failOptionWrite = true;
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "通信できません" })).toBeVisible();
  state.failOptionWrite = false;
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "削除しました" })).toBeVisible();
  await expect(exercise).toHaveValue("ケーブルロウ");
  await expect(exercise.locator("option:checked")).toHaveText("ケーブルロウ（保存済み）");
  expect(submissions).toBe(0);
  await page.getByRole("button", { name: "← 戻る", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "＋ 記録する", exact: true }).click();
  await expect(exercise).toHaveValue("ケーブルロウ");
  await expect(page.getByLabel("種目1 セット1 重量", { exact: true })).toHaveValue("30");
  await page.getByRole("button", { name: "保存して共有", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "保存失敗の確認" })).toBeVisible();
  expect(submissions).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "test-results/exercise-options-mobile.png",
    fullPage: true,
  });
});

test("候補取得の失敗は再試行でき、空リストからも種目を追加できる", async ({ page }) => {
  const state = await mockTraining(page);
  state.failOptions = true;
  await page.getByRole("button", { name: "＋ 記録する", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "通信できません" })).toBeVisible();
  await expect(page.getByText("種目を追加してください。", { exact: false })).toHaveCount(0);
  state.failOptions = false;
  state.options = [];
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByText("種目を追加してください。", { exact: false })).toBeVisible();
  await page.getByText("種目リスト", { exact: true }).click();
  await page.getByLabel("新しい種目", { exact: true }).fill("新しい種目");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  const exercise = page.getByRole("combobox", { name: "種目名", exact: true });
  await exercise.selectOption({ label: "新しい種目" });
  await expect(exercise).toHaveValue("新しい種目");
});

test("空白・長すぎる候補名を送信せず、複数の種目を別々に選べる", async ({ page }) => {
  const state = await mockTraining(page);
  await page.getByRole("button", { name: "＋ 記録する", exact: true }).click();
  await page.getByText("種目リスト", { exact: true }).click();
  const name = page.getByLabel("新しい種目", { exact: true });
  for (const invalid of ["   ", "長".repeat(61)]) {
    await name.fill(invalid);
    await page.getByRole("button", { name: "追加", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "1〜60文字" })).toBeVisible();
    await expect(name).toHaveValue(invalid);
    expect(state.options).toHaveLength(2);
  }
  await page.getByRole("combobox", { name: "種目名", exact: true }).selectOption("ベンチプレス");
  await page.getByRole("button", { name: "＋ 種目", exact: true }).click();
  const exercises = page.getByRole("combobox", { name: "種目名", exact: true });
  await expect(exercises).toHaveCount(2);
  await exercises.nth(1).selectOption("スクワット");
  await expect(exercises.nth(0)).toHaveValue("ベンチプレス");
  await expect(exercises.nth(1)).toHaveValue("スクワット");
  await page.getByRole("button", { name: "種目1を削除", exact: true }).click();
  await expect(exercises).toHaveCount(1);
  await expect(exercises).toHaveValue("スクワット");
  expect(state.options).toHaveLength(2);
});
