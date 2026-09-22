import { expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`${width}pxでメモB案と終了確認から記録へ戻れる`, async ({ page }) => {
    const state = await mockTraining(page);
    await page.route("**/api/exercises/context?*", (route) =>
      route.fulfill({
        json: {
          best_weight: 60,
          best_rm: 80,
          previous: null,
          memo: { content: "肩を下げて、ゆっくり下ろす。", revision: 1 },
        },
      }),
    );
    await startTraining(page);
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "メモを常に表示", exact: true }).click();
    const memos = page.getByRole("region", { name: "記録のメモ" });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await expect(memos).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(memos).toHaveCSS("border-top-width", "0px");
      await expect(memos).toHaveCSS("border-bottom-width", "1px");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (width === 390)
        await page.screenshot({ path: `../docs/images/design-standard/recording-${theme}.png` });
    }
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
