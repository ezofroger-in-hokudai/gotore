import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("ホーム画面に追加したアプリでは左端スワイプで直前の画面へ戻る", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const matchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        const result = matchMedia(query);
        if (query !== "(display-mode: standalone)") return result;
        return new Proxy(result, {
          get(target, property) {
            if (property === "matches") return true;
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      };
    });
    const state = await mockTraining(page);
    const cdp = await context.newCDPSession(page);
    const swipeBack = async () => {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 12, y: 360 }],
      });
      for (const x of [45, 90, 150]) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: 363 }],
        });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };

    await navigate(page, "グループ");
    await page.getByRole("button", { name: `${state.group.name}の詳細`, exact: true }).click();
    await expect(page.getByRole("heading", { name: state.group.name, level: 2 })).toBeVisible();
    await swipeBack();
    await expect(page.getByRole("heading", { name: "グループ", exact: true })).toBeVisible();
    await swipeBack();
    await expect(page.getByRole("region", { name: "今日の活動", exact: true })).toBeVisible();
    await swipeBack();
    await expect(page.getByRole("region", { name: "今日の活動", exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});
