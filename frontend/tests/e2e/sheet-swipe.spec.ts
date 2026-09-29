import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("シートの取っ手を下へスワイプすると閉じ、本文の操作では閉じない", async ({ browser }) => {
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
    const cdp = await context.newCDPSession(page);
    const swipe = async (x: number, y: number) => {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (const offset of [30, 70, 120]) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y + offset }],
        });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    const heading = await sheet.getByRole("heading", { name: "外観" }).boundingBox();
    if (!heading) throw new Error("シート見出しの位置を確認できません");
    await swipe(heading.x + heading.width / 2, heading.y + heading.height / 2);
    await expect(sheet).toBeVisible();
    const handle = await sheet.locator(".sheet-handle").boundingBox();
    if (!handle) throw new Error("シートの取っ手の位置を確認できません");
    await swipe(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => history.state?.gotoreSheet)).toBeFalsy();
  } finally {
    await context.close();
  }
});

test("未保存のグループ作成は取っ手のスワイプで閉じない", async ({ page }) => {
  await mockTraining(page);
  await navigate(page, "グループ");
  await page.getByRole("button", { name: /作成/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "グループを作成" });
  const name = sheet.getByRole("textbox", { name: "グループ名" });
  await name.fill("入力途中のグループ");
  const handle = await sheet.locator(".sheet-handle").boundingBox();
  if (!handle) throw new Error("シートの取っ手の位置を確認できません");
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 120, { steps: 5 });
  await page.mouse.up();
  await expect(name).toHaveValue("入力途中のグループ");
});
