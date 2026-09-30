import { expect, test } from "./fixtures";
import { mockTraining, startTraining } from "./mock-training";

test("端末保存済みのセットは送信失敗中も次の種目へ進め、自動再送する", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  state.failSave = true;
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("70");
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SET 2", exact: true })).toBeVisible();
  const queueKey = `gotore:session-queue:v1:${state.user.id}`;
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.pending?.length,
        queueKey,
      ),
    )
    .toBe(1);
  await page.screenshot({ path: "test-results/session-background-send-after.png", fullPage: true });
  await expect(page.locator(".sync-status")).toHaveCount(0);
  let dialogs = 0;
  page.on("dialog", (dialog) => {
    dialogs++;
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  await page.getByRole("button", { name: /^スクワット/ }).click();
  await expect(page.getByRole("button", { name: "スクワット", exact: true })).toBeVisible();
  expect(dialogs).toBe(0);
  state.failSave = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => state.session?.exercises[0]?.sets).toEqual([{ weight: 70, reps: 8 }]);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.pending?.length,
        queueKey,
      ),
    )
    .toBe(0);
});
