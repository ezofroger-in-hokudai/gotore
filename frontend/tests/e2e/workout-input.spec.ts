import { expect, test } from "@playwright/test";
import { mockTraining } from "./mock-training";

test("Enterで入力を進め、未確定の記録を送信せず下書きを保持する", async ({ page }) => {
  await mockTraining(page);
  await page.getByRole("button", { name: "＋ トレーニングを記録", exact: true }).click();
  let submissions = 0;
  await page.route("**/api/workouts", (route) => {
    if (route.request().method() === "POST") submissions++;
    return route.fulfill({
      status: 500,
      json: { detail: "入力テストでは保存しない" },
    });
  });
  await page.getByLabel("種目名", { exact: true }).selectOption({ label: "スクワット" });
  const weight = page.getByLabel("種目1 セット1 重量", { exact: true });
  const reps = page.getByLabel("種目1 セット1 回数", { exact: true });
  await weight.fill("60.5");
  await weight.press("Enter");
  await expect(reps).toBeFocused();
  await reps.fill("8");
  await reps.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(page.getByLabel("種目1 セット2 重量", { exact: true })).toHaveCount(0);
  await reps.press("Enter");
  const nextWeight = page.getByLabel("種目1 セット2 重量", { exact: true });
  await expect(nextWeight).toBeFocused();
  await expect(nextWeight).toHaveValue("");
  await expect(nextWeight).toHaveAttribute("placeholder", "60.5");
  await expect(page.getByLabel("種目1 セット2 回数", { exact: true })).toHaveValue("");
  await nextWeight.press("Enter");
  await expect(nextWeight).toHaveValue("60.5");
  await expect(page.getByLabel("種目1 セット2 回数", { exact: true })).toBeFocused();
  await reps.press("Enter");
  await expect(nextWeight).toBeFocused();
  await expect(page.getByLabel("種目1 セット3 重量", { exact: true })).toHaveCount(0);
  await nextWeight.dispatchEvent("keydown", { key: "Enter", repeat: true });
  await expect(nextWeight).toBeFocused();
  await nextWeight.fill("1001");
  await nextWeight.press("Enter");
  await expect(nextWeight).toBeFocused();
  await nextWeight.fill("60");
  await page.getByRole("button", { name: "← 戻る（下書きは残ります）", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "＋ トレーニングを記録", exact: true }).click();
  await expect(nextWeight).toHaveValue("60");
  await page.screenshot({
    path: "test-results/workout-input-mobile.png",
    fullPage: true,
  });
  for (let count = 2; count < 30; count++) {
    await page.getByRole("button", { name: "＋ セットを追加", exact: true }).click();
  }
  const lastReps = page.getByLabel("種目1 セット30 回数", { exact: true });
  await page.getByLabel("種目1 セット30 重量", { exact: true }).fill("60");
  await lastReps.fill("10");
  await lastReps.press("Enter");
  await expect(page.getByRole("button", { name: "＋ セットを追加", exact: true })).toBeDisabled();
  await expect(page.getByLabel("種目1 セット31 重量", { exact: true })).toHaveCount(0);
  expect(submissions).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
