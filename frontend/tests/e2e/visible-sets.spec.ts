import { expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`${width}pxで全セットをスクロールでき、メモ切替で現行入力が動かない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    const state = await mockTraining(page);
    await page.route("**/api/exercises/context?*", (route) =>
      route.fulfill({
        json: {
          best_weight: 80,
          best_rm: 101.3,
          previous: {
            id: "previous",
            performed_on: "2026-09-15",
            sets: [
              { weight: 80, reps: 8 },
              { weight: 75, reps: 10 },
            ],
          },
          memo: { content: "肩甲骨を寄せて、胸を張って押す", revision: 1 },
        },
      }),
    );
    await startTraining(page);
    for (let i = 0; i < 8; i++) {
      await page.getByRole("button", { name: "セットを追加", exact: true }).click();
      await expect(page.getByRole("heading", { name: `SET ${i + 2}`, exact: true })).toBeVisible();
    }
    const table = page.getByRole("region", { name: "今回と前回の全セット" });
    await table.evaluate((el) => {
      el.scrollTop = 0;
    });
    const visible = await table.evaluate((el) => {
      const bounds = el.getBoundingClientRect();
      return [...el.children].filter((row) => {
        const box = row.getBoundingClientRect();
        return box.top >= bounds.top && box.bottom <= bounds.bottom;
      }).length;
    });
    expect(visible).toBeGreaterThanOrEqual(2);
    await table.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.getByRole("button", { name: "セット8を編集", exact: true })).toBeInViewport();
    const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
    await weight.fill("62.5");
    const before = await weight.boundingBox();
    await page.getByRole("button", { name: "種目メモを編集", exact: true }).click();
    const memo = page.getByRole("textbox", { name: "種目メモ", exact: true });
    await expect(memo).toBeVisible();
    await expect(weight).toHaveValue("62.5");
    if (width === 390) await page.screenshot({ path: "test-results/visible-sets-memo.png" });
    expect((await weight.boundingBox())?.y).toBe(before?.y);
    await memo.press("Enter");
    await page.screenshot({ path: `test-results/visible-sets-${width}.png` });
    await table.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.getByRole("button", { name: "セット1を編集", exact: true }).click();
    await weight.fill("72.5");
    await page.getByRole("button", { name: "変更を保存", exact: true }).click();
    await expect.poll(() => state.session?.exercises[0].sets[0].weight).toBe(72.5);
    for (const name of ["セットを追加", "次の種目へ", "トレーニング終了"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test("未保存メモを再起動と終了確認の後も保持する", async ({ page }) => {
  await mockTraining(page);
  await startTraining(page);
  await page.getByRole("button", { name: "種目メモを編集", exact: true }).click();
  const memo = page.getByRole("textbox", { name: "種目メモ", exact: true });
  await memo.fill("肩甲骨を寄せてゆっくり下ろす");
  await page.reload();
  const { openTraining } = await import("./mock-training");
  await openTraining(page);
  await expect(memo).toHaveValue("肩甲骨を寄せてゆっくり下ろす");
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  const finish = page.getByRole("dialog", { name: "トレーニング終了", exact: true });
  await expect(finish).toBeVisible();
  await page.screenshot({ path: "test-results/visible-sets-finish.png" });
  await finish.getByRole("button", { name: "トレーニングに戻る", exact: true }).click();
  await expect(page.getByRole("region", { name: "種目メモ", exact: true })).toContainText(
    "肩甲骨を寄せてゆっくり下ろす",
  );
});
