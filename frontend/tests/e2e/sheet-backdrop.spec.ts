import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("シート外をタップすると閉じ、内側の操作と履歴を保つ", async ({ page }) => {
  await mockTraining(page);
  await navigate(page, "設定");
  await page.getByRole("button", { name: /^外観/ }).click();
  const sheet = page.getByRole("dialog", { name: "外観" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("heading", { name: "外観" }).click();
  await expect(sheet).toBeVisible();
  const inside = await sheet.boundingBox();
  if (!inside) throw new Error("シートの位置を確認できません");
  await page.mouse.move(inside.x + inside.width / 2, inside.y + 40);
  await page.mouse.down();
  await page.mouse.move(8, 80, { steps: 5 });
  await page.mouse.up();
  await expect(sheet).toBeVisible();
  await page.mouse.click(8, 80);
  await page.screenshot({ path: "test-results/sheet-backdrop-after.png", fullPage: true });
  await expect(sheet).toHaveCount(0);
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: /^外観/ }).click();
    await expect(sheet).toBeVisible();
    await page.mouse.click(8, 80);
    await expect(sheet).toHaveCount(0);
  }
  await page.goBack();
  await expect(page.getByRole("region", { name: "今日の活動", exact: true })).toBeVisible();
});

test("編集中の表示名は背景タップで意図せず閉じない", async ({ page }) => {
  await mockTraining(page);
  await navigate(page, "設定");
  await page.getByRole("button", { name: /^表示名/ }).click();
  const sheet = page.getByRole("dialog", { name: "表示名" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("textbox", { name: "表示名" }).fill("入力途中の名前");
  await page.mouse.click(8, 80);
  await expect(sheet.getByRole("textbox", { name: "表示名" })).toHaveValue("入力途中の名前");
});

test("タッチ操作でも背景だけを閉じる", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await mockTraining(page);
    await navigate(page, "設定");
    await page.getByRole("button", { name: /^外観/ }).click();
    const sheet = page.getByRole("dialog", { name: "外観" });
    await expect(sheet).toBeVisible();
    await page.touchscreen.tap(8, 80);
    await expect(sheet).toHaveCount(0);
  } finally {
    await context.close();
  }
});
