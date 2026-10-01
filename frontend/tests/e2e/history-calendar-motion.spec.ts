import { expect, test } from "@playwright/test";
import { mockTraining, navigate, openGroup } from "./mock-training";

for (const group of [false, true]) {
  test(`${group ? "グループ" : "個人"}のカレンダーは指に追従し、隣月と並んで滑る`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
    await mockTraining(page);
    await page.route("**/api/history/summary", (route) =>
      route.fulfill({
        json: {
          workout_count: 3,
          total_sets: 3,
          total_volume: 1800,
          first_performed_on: "2026-07-01",
          exercises: [],
        },
      }),
    );
    await page.route("**/api/**/activity?*", (route) => {
      const month = new URL(route.request().url()).searchParams.get("month");
      return route.fulfill({
        json: {
          month,
          metric: "volume",
          total_volume: 600,
          active_days: 1,
          workout_count: 1,
          total_sets: 1,
          days: [
            { date: `${month}-05`, volume: 600, set_count: 1, workout_count: 1, body_parts: [] },
          ],
        },
      });
    });
    await page.reload();
    if (group) {
      await openGroup(page);
      await page
        .getByRole("navigation", { name: "グループの表示" })
        .getByRole("button", { name: "カレンダー" })
        .click();
    } else await navigate(page, "履歴");
    const calendar = page.locator(".personal-history-calendar:visible");
    const viewport = calendar.locator(".history-calendar-viewport");
    await expect(calendar.locator(".personal-history-days button").first()).toBeEnabled();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.gotoreNavigationDirection))
      .toBeUndefined();
    const box = await viewport.boundingBox();
    if (!box) throw new Error("calendar not visible");
    const x = box.x + box.width * 0.4;
    const y = box.y + box.height * 0.4;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 90, y, { steps: 6 });
    const offset = await calendar
      .locator(".history-calendar-track")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    expect(offset).toBeGreaterThan(-box.width + 70);
    await expect(calendar.locator(".history-calendar-page")).toHaveCount(3);
    await page.mouse.up();
    await expect(calendar).toHaveAttribute("data-moving", "false");
    await expect(calendar.locator(".personal-history-month strong")).toHaveText("2026年8月");
    await expect(calendar.locator(".personal-history-days > *")).toHaveCount(42);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 12, y, { steps: 3 });
    await page.mouse.up();
    await expect(calendar).toHaveAttribute("data-moving", "false");
    await expect(calendar.locator(".personal-history-month strong")).toHaveText("2026年8月");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 65, y, { steps: 5 });
    await page.mouse.move(x, y, { steps: 5 });
    await page.mouse.up();
    await expect(calendar).toHaveAttribute("data-moving", "false");
    await expect(calendar.locator(".personal-history-month strong")).toHaveText("2026年8月");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 85, y, { steps: 5 });
    await calendar.dispatchEvent("pointercancel", { pointerId: 1, clientX: x + 85, clientY: y });
    await page.mouse.up();
    await expect(calendar).toHaveAttribute("data-moving", "false");
    await expect(calendar.locator(".personal-history-month strong")).toHaveText("2026年8月");
    await viewport.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(calendar).toHaveAttribute("data-moving", "false");
    await expect(calendar.locator(".personal-history-month strong")).toHaveText("2026年9月");
    await expect(calendar.getByRole("button", { name: /^2026年9月29日、/ })).toBeDisabled();
    const target = calendar.getByRole("button", { name: /^2026年9月5日、/ });
    expect(
      await target.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("button") === el
        );
      }),
    ).toBe(true);
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(calendar.locator(".personal-history-days > *")).toHaveCount(42);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await viewport.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(calendar).toHaveAttribute("data-moving", "false");
    await expect(calendar.locator(".personal-history-month strong")).toHaveText("2026年8月");
    expect(
      await calendar.locator(".history-calendar-track").evaluate((el) => el.getAnimations().length),
    ).toBe(0);
    if (!group) {
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await expect(calendar.locator(".personal-history-month strong")).toHaveText("2026年7月");
    }
  });
}

test("読み込み中の月に前月の負荷を流用せず、失敗しても再試行できる", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
  await mockTraining(page, true, false, false);
  await page.route("**/api/history/summary", (route) =>
    route.fulfill({
      json: {
        workout_count: 1,
        total_sets: 1,
        total_volume: 600,
        first_performed_on: "2026-07-01",
        exercises: [],
      },
    }),
  );
  let release: (() => void) | undefined;
  let fail = true;
  await page.route("**/api/workouts/activity?*", async (route) => {
    const month = new URL(route.request().url()).searchParams.get("month");
    if (month === "2026-08" && fail) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return route.fulfill({ status: 500, json: { detail: "取得テスト失敗" } });
    }
    return route.fulfill({
      json: {
        month,
        metric: "volume",
        total_volume: 600,
        active_days: 1,
        workout_count: 1,
        total_sets: 1,
        days: [
          { date: `${month}-05`, volume: 600, set_count: 1, workout_count: 1, body_parts: [] },
        ],
      },
    });
  });
  await page.reload();
  await navigate(page, "履歴");
  const calendar = page.locator(".personal-history-calendar:visible");
  await expect(calendar.locator(".personal-history-days button").first()).toBeEnabled();
  await calendar.locator(".history-calendar-viewport").focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => !!release).toBe(true);
  await expect(calendar).toHaveAttribute("data-moving", "false");
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText("—");
  await expect(calendar.locator(".personal-history-days button:enabled")).toHaveCount(0);
  release?.();
  await expect(calendar.getByRole("button", { name: "再試行", exact: false })).toBeVisible();
  fail = false;
  await calendar.getByRole("button", { name: "再試行", exact: false }).click();
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText("600kg");
  await expect(calendar.locator(".personal-history-days button").first()).toBeEnabled();
});
