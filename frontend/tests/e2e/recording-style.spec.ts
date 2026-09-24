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
    const comparison = page.getByRole("region", { name: "今回と前回の全セット", exact: true });
    await expect(comparison.getByText("60kg × 8", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "前回の全セットをコピー" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "前回のセット1をコピー", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "前回のセット1をコピー", exact: true }).click();
    await expect(comparison.getByRole("button", { name: "セット1を編集" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "SET 2", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "前回の全セットをコピー" }).click();
    await expect(comparison.getByRole("button", { name: "セット4を編集" })).toContainText(
      "57.5kg × 10",
    );
    const firstTrash = comparison.getByRole("button", { name: "セット1を削除" });
    const fourthTrash = comparison.getByRole("button", { name: "セット4を削除" });
    await expect(firstTrash).toBeVisible();
    await expect(fourthTrash).toBeVisible();
    expect(Math.round((await firstTrash.boundingBox())?.x ?? -1)).toBe(
      Math.round((await fourthTrash.boundingBox())?.x ?? -2),
    );
    await comparison.getByRole("button", { name: "セット1を編集" }).click();
    await expect(page.getByRole("heading", { name: "SET 1 を編集", exact: true })).toBeVisible();
    await comparison.getByRole("button", { name: "セット1を編集" }).click();
    await expect(page.getByRole("heading", { name: "SET 5", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "種目メモを編集", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "今日のメモを編集", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "今日のメモを編集", exact: true }).click();
    const todayMemo = page.getByRole("textbox", { name: "今日のメモ", exact: true });
    await todayMemo.fill("バーをまっすぐ下ろす");
    await todayMemo.press("Enter");
    await expect(todayMemo).toBeHidden();
    await expect(page.getByRole("button", { name: "今日のメモを編集", exact: true })).toContainText(
      "バーをまっすぐ下ろす",
    );
    await expect(page.getByText("同期済み", { exact: false })).toHaveCount(0);
    await expect(page.getByText("グループに共有", { exact: false })).toHaveCount(0);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (width === 390) await page.screenshot({ path: `test-results/recording-${theme}.png` });
    }
    const inputToggle = page.getByRole("button", { name: "入力欄をしまう", exact: true });
    await inputToggle.click();
    await expect(page.getByRole("button", { name: "入力欄を開く", exact: true })).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "入力欄を開く", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "今日のトレーニング終了", exact: true }).click();
    const finish = page.getByRole("dialog", { name: "トレーニング終了", exact: true });
    await expect(finish.getByRole("button", { name: "まだ続ける", exact: true })).toBeVisible();
    await expect(
      finish.getByRole("button", { name: "今日のトレーニング終了", exact: true }),
    ).toBeVisible();
    if (width === 390) await page.screenshot({ path: "test-results/finish-dark.png" });
    await finish.getByRole("button", { name: "まだ続ける", exact: true }).click();
    await expect(finish).not.toBeVisible();
    expect(state.finished).toHaveLength(0);
    await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await page.getByRole("button", { name: "今日のトレーニング終了", exact: true }).click();
    await finish.getByRole("button", { name: "今日のトレーニング終了", exact: true }).click();
    await expect.poll(() => state.finished.length).toBe(1);
  });
}
