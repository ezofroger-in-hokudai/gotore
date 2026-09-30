import { expect, test } from "./fixtures";
import { mockTraining, navigate } from "./mock-training";

test("グループカード上の短い縦スワイプでページをスクロールする", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 320 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    const state = await mockTraining(page);
    await navigate(page, "グループ");
    const card = page.getByRole("button", { name: `${state.group.name}の詳細`, exact: true });
    await expect(card).toBeVisible();
    const bounds = await card.boundingBox();
    if (!bounds) throw new Error("カードの位置を確認できません");
    const x = bounds.x + 40;
    const y = bounds.y + bounds.height / 2;
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (const offset of [30, 70, 120]) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y - offset }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(20);
    await expect(card).toBeVisible();
  } finally {
    await context.close();
  }
});
