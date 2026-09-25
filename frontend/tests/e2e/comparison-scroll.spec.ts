import { expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`前回10セットでも一覧位置を勝手に動かさない（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await mockTraining(page);
    await page.route("**/api/exercises/context?**", (route) =>
      route.fulfill({
        json: {
          previous: {
            id: "previous",
            performed_on: "2026-09-01",
            sets: Array.from({ length: 10 }, () => ({ weight: 80, reps: 8 })),
          },
          memo: { content: "", revision: 0 },
          best_weight: 80,
          best_rm: 101.3,
        },
      }),
    );
    await startTraining(page);
    const table = page.getByRole("region", { name: "今回と前回の全セット", exact: true });
    await expect(table.locator(".comparison-row")).toHaveCount(10);
    await table.evaluate((element) => {
      element.scrollTop = 48;
    });
    await page.getByRole("button", { name: "セットを追加", exact: true }).click();
    await expect.poll(() => table.evaluate((element) => element.scrollTop)).toBe(48);
  });
}
