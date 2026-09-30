import { expect, test } from "./fixtures";
import { mockTraining, startTraining } from "./mock-training";

test("記録済み種目から1タップで復帰し、未保存入力は確認なしに捨てない", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("60");
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect.poll(() => state.saves).toBe(1);
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  const overview = page.locator(".today-training");
  await overview.locator("summary").click();
  await expect(overview).toContainText("60kg");
  await expect(overview).toHaveAttribute("open", "");
  await page.getByRole("button", { name: /^スクワット/ }).click();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("80");
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect.poll(() => state.saves).toBe(2);
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("82.5");
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .locator(".exercise-picker-list")
    .getByRole("button", { name: /^ベンチプレス/ })
    .click();
  await expect(page.locator(".exercise-picker-list")).toBeVisible();
  await page
    .locator(".exercise-picker-list")
    .getByRole("button", { name: /^スクワット/ })
    .click();
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("82.5");
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator(".exercise-picker-list")
    .getByRole("button", { name: /^ベンチプレス/ })
    .click();
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("60");
  await page.getByRole("button", { name: "セット1を編集", exact: true }).click();
  await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("9");
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  await expect.poll(() => state.saves).toBe(3);
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect.poll(() => state.session?.exercises[0].sets.length).toBe(2);
  expect(state.session?.exercises[1].sets).toEqual([{ weight: 80, reps: 8 }]);
});
