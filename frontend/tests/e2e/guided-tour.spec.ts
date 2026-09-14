import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`${width}px: 実画面の対象を囲み、閲覧だけで6段階を案内する`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const state = await mockTraining(page, true, true);
    const guide = page.getByRole("region", { name: "使い方ガイド" });
    const outline = page.locator(".tour-highlight");
    const targets = ["start", "exercises", "calendar", "graph", "groups", "replay"];
    for (const [index, target] of targets.entries()) {
      await expect(guide).toContainText(`${index + 1} / 6`);
      await expect(outline).toBeVisible();
      const element = page.locator(`[data-tour="${target}"]`).first();
      await expect(element).toBeVisible();
      await expect
        .poll(async () => {
          const box = await element.boundingBox();
          const frame = await outline.boundingBox();
          return (
            !!box &&
            !!frame &&
            Math.abs(frame.x - (box.x - 5)) < 2 &&
            Math.abs(frame.y - (box.y - 5)) < 2
          );
        })
        .toBe(true);
      const box = await guide.boundingBox();
      expect(
        box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 845,
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await guide
        .getByRole("button", { name: index === 5 ? "はじめる" : "次へ", exact: true })
        .click();
    }
    await expect(guide).toHaveCount(0);
    expect(state.session).toBeNull();
    expect(state.saves).toBe(0);
    expect(state.syncs).toBe(0);
    await navigate(page, "設定");
    await page.getByRole("button", { name: /^使い方/ }).click();
    await expect(guide).toContainText("1 / 6");
    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);
  });
}

test("文字拡大・スクロールに追従し、対象の操作中は隠して案内へ戻れる", async ({ page }) => {
  const state = await mockTraining(page, true, true);
  const guide = page.getByRole("region", { name: "使い方ガイド" });
  await guide.getByRole("button", { name: "次へ", exact: true }).click();
  await page.getByRole("button", { name: "種目を管理", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "種目一覧", exact: true });
  await expect(sheet).toBeVisible();
  await expect(guide).toBeHidden();
  await sheet.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(guide).toBeVisible();
  for (let index = 0; index < 4; index++)
    await guide.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(guide).toContainText("6 / 6");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    window.scrollBy(0, 80);
  });
  await expect
    .poll(async () => {
      const target = await page.locator('[data-tour="replay"]').boundingBox();
      const frame = await page.locator(".tour-highlight").boundingBox();
      return !!target && !!frame && Math.abs(frame.y - target.y + 5) < 2;
    })
    .toBe(true);
  await guide.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(guide).toContainText("5 / 6");
  await guide.getByRole("button", { name: "次へ", exact: true }).click();
  await navigate(page, "ホーム");
  await expect(page.locator(".tour-highlight")).toHaveCount(0);
  await guide.getByRole("button", { name: "案内の画面に戻る", exact: true }).click();
  await expect(page.locator(".tour-highlight")).toBeVisible();
  await guide.getByRole("button", { name: "はじめる", exact: true }).click();
  await expect(guide).toHaveCount(0);
  expect(state.session).toBeNull();
  expect(state.saves).toBe(0);
});
