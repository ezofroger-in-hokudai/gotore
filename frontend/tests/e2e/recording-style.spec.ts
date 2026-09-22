import { expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`${width}pxで記録入力・メモ・終了を操作できる`, async ({ page }) => {
    const state = await mockTraining(page);
    await page.route("**/api/exercises/context?*", (route) =>
      route.fulfill({
        json: {
          best_weight: 60,
          best_rm: 80,
          previous: {
            id: "previous-workout",
            performed_on: "2026-09-10",
            sets: [
              { weight: 60, reps: 8 },
              { weight: 60, reps: 8 },
              { weight: 57.5, reps: 10 },
            ],
          },
          memo: { content: "肩を下げて、ゆっくり下ろす。", revision: 1 },
        },
      }),
    );
    await startTraining(page);
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByText("前回 60kg × 8回", { exact: true }).first()).toBeVisible();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (width === 390)
        await page.screenshot({ path: `../docs/images/design-standard/recording-${theme}.png` });
    }
    await page.getByRole("button", { name: "メモを開く", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "メモ", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
    const finish = page.getByRole("dialog", { name: "トレーニング終了", exact: true });
    await expect(finish.getByRole("button")).toHaveCount(2);
    if (width === 390)
      await page.screenshot({ path: "../docs/images/design-standard/finish-dark.png" });
    await finish.getByRole("button", { name: "記録に戻る", exact: true }).click();
    await expect(finish).not.toBeVisible();
    expect(state.finished).toHaveLength(0);
    await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
    await finish.getByRole("button", { name: "終了する", exact: true }).click();
    await expect.poll(() => state.finished.length).toBe(1);
  });
}
