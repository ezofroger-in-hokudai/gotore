import { expect, test } from "@playwright/test";
import { createTestUser, testPassword } from "./local-auth";

test("Enterで入力を進め、未確定の記録を送信せず下書きを保持する", async ({ page }) => {
  const email = `input-${crypto.randomUUID()}@example.test`;
  await createTestUser("入力テスト", email);
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログインする →", exact: true }).click();
  await page.getByRole("button", { name: "＋ トレーニングを記録", exact: true }).click();
  let submissions = 0;
  await page.route("**/api/workouts", (route) => {
    if (route.request().method() === "POST") submissions++;
    return route.continue();
  });
  await page.getByLabel("種目名", { exact: true }).fill("スクワット");
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
