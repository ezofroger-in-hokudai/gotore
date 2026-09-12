import { expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`前回10セットでも今回の追加行を表示し、編集で末尾へ飛ばない（${width}px）`, async ({
    page,
  }) => {
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
    const table = page.getByRole("region", { name: "全セットの比較", exact: true });
    await expect(table.locator(".comparison-row")).toHaveCount(10);
    const rowVisible = async (index: number) => {
      const bounds = await table.boundingBox();
      const row = await table.locator(".comparison-row").nth(index).boundingBox();
      return (
        !!bounds &&
        !!row &&
        row.y >= bounds.y - 1 &&
        row.y + row.height <= bounds.y + bounds.height + 1
      );
    };
    for (let set = 1; set <= 11; set++) {
      if (set === 2)
        await page.getByRole("spinbutton", { name: "回数", exact: true }).press("Enter");
      else await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
      await expect.poll(() => rowVisible(set - 1)).toBe(true);
      await expect(page.locator(".sync-status")).toContainText("同期済み");
    }
    await table.evaluate((element) => {
      element.scrollTop = 0;
    });
    await table.getByRole("button", { name: "セット1を編集", exact: true }).click();
    await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("9");
    await page.getByRole("button", { name: "変更を保存", exact: true }).click();
    await expect.poll(() => rowVisible(0)).toBe(true);
  });
}
