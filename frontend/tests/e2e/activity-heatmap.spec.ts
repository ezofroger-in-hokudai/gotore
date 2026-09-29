import { type Page, expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

async function fixture(page: Page, now = "2024-02-29T03:00:00Z") {
  await page.clock.setFixedTime(new Date(now));
  const state = await mockTraining(page);
  let failMonth = false;
  let failDay = false;
  let holdDay: Promise<void> | null = null;
  await page.route("**/api/history/summary", (route) =>
    route.fulfill({
      json: {
        workout_count: 53,
        total_sets: 56,
        total_volume: 16800,
        first_performed_on: "2024-01-01",
        exercises: [],
      },
    }),
  );
  await page.route("**/api/workouts/activity?*", (route) => {
    if (failMonth) return route.abort();
    const month = new URL(route.request().url()).searchParams.get("month");
    const days =
      month === "2024-02"
        ? [
            { date: "2024-02-01", volume: 1500, set_count: 5, workout_count: 2 },
            { date: "2024-02-29", volume: 15300, set_count: 51, workout_count: 51 },
          ]
        : [];
    return route.fulfill({
      json: {
        month,
        metric: "volume",
        days,
        total_volume: days.reduce((sum, day) => sum + day.volume, 0),
        total_sets: days.length ? 56 : 0,
        workout_count: days.length ? 53 : 0,
        active_days: days.length,
      },
    });
  });
  await page.route("**/api/workouts?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const day = params.get("performed_on");
    if (day && failDay) return route.abort();
    if (day === "2024-02-01" && holdDay) await holdDay;
    const offset = Number(params.get("offset") ?? 0);
    const count = day === "2024-02-29" ? (offset ? 1 : 50) : day === "2024-02-01" ? 2 : 0;
    return route.fulfill({
      json: Array.from({ length: count }, (_, i) => ({
        id: `${day}-${offset + i}`,
        user_id: state.user.id,
        display_name: "画面テスト",
        group_id: null,
        performed_on: day,
        created_at: "2024-02-29T00:00:00Z",
        revision: 1,
        exercises: [{ name: `${day}の種目${offset + i + 1}`, sets: [{ weight: 30, reps: 10 }] }],
      })),
    });
  });
  await navigate(page, "履歴");
  await expect(page.locator(".personal-history-summary")).toContainText("53回");
  const calendar = page.locator(".personal-history-calendar");
  await expect(calendar.locator(".personal-history-month strong")).toHaveText("2024年2月");
  return {
    calendar,
    failMonth: (value: boolean) => {
      failMonth = value;
    },
    failDay: (value: boolean) => {
      failDay = value;
    },
    holdDay: (value: Promise<void> | null) => {
      holdDay = value;
    },
  };
}

async function moveMonth(page: Page, key: "ArrowLeft" | "ArrowRight") {
  await page.locator(".personal-history-days button").first().focus();
  await page.keyboard.press(key);
}

test("総負荷カレンダーから日付を選び、51件の日別記録を省略せず表示する", async ({ page }) => {
  const { calendar } = await fixture(page);
  await calendar.getByRole("button", { name: /2024年2月29日、15,300kg、51セット/ }).click();
  const sheet = page.getByRole("dialog", { name: "2024年2月29日の全メニュー" });
  await expect(sheet.locator(".record-review")).toHaveCount(51);
  await expect(sheet.getByRole("heading", { name: "2024-02-29の種目51" })).toBeVisible();
  await sheet.getByRole("button", { name: "閉じる" }).click();
  await calendar.getByRole("button", { name: /2024年2月2日、記録なし/ }).click();
  await expect(page.getByRole("dialog")).toContainText("この日の記録はありません");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("月・日付の通信失敗を再試行し、閉じた日付の遅い応答を表示しない", async ({ page }) => {
  const state = await fixture(page);
  state.failMonth(true);
  await moveMonth(page, "ArrowLeft");
  await expect(state.calendar.getByRole("alert")).toBeVisible();
  state.failMonth(false);
  await state.calendar.getByRole("button", { name: "再試行" }).click();
  await expect(state.calendar.locator(".personal-history-month strong")).toHaveText("2024年1月");
  await moveMonth(page, "ArrowRight");
  state.failDay(true);
  await state.calendar.getByRole("button", { name: /2024年2月29日/ }).click();
  const sheet = page.getByRole("dialog", { name: "2024年2月29日の全メニュー" });
  await expect(sheet.getByRole("alert")).toBeVisible();
  state.failDay(false);
  await sheet.getByRole("button", { name: "再試行" }).click();
  await expect(sheet.locator(".record-review")).toHaveCount(51);
  await sheet.getByRole("button", { name: "閉じる" }).click();
  let release = () => {};
  state.holdDay(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  try {
    await state.calendar.getByRole("button", { name: /2024年2月1日/ }).click();
    await expect(page.getByRole("dialog", { name: "2024年2月1日の全メニュー" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
    await state.calendar.getByRole("button", { name: /2024年2月2日/ }).click();
    release();
    await expect(page.getByRole("dialog", { name: "2024年2月2日の全メニュー" })).toContainText(
      "この日の記録はありません",
    );
    await expect(page.getByRole("dialog").getByText("2024-02-01の種目1")).toHaveCount(0);
  } finally {
    release();
  }
});

test("日本時間の未来日を開かず、最初の記録月より前へ移動しない", async ({ page }) => {
  const { calendar } = await fixture(page, "2024-02-10T15:00:00Z");
  await expect(calendar.getByRole("button", { name: /2024年2月11日/ })).toBeEnabled();
  await expect(calendar.getByRole("button", { name: /2024年2月12日/ })).toBeDisabled();
  await moveMonth(page, "ArrowLeft");
  await expect(calendar.locator(".personal-history-month strong")).toHaveText("2024年1月");
  await moveMonth(page, "ArrowLeft");
  await expect(calendar.locator(".personal-history-month strong")).toHaveText("2024年1月");
});
