import { type Page, expect, test } from "@playwright/test";
import { chooseHistoryMonth, historyMonth, moveHistoryMonth } from "./history-period-helper";
import { mockTraining } from "./mock-training";

test.use({ locale: "ja-JP" });

async function activityFixture(page: Page) {
  const state = await mockTraining(page, true, false, false);
  await page.route("**/api/history/summary", (route) =>
    route.fulfill({
      json: {
        first_performed_on: "2024-01-01",
        total_volume: 16800,
        total_sets: 56,
        workout_count: 53,
        exercises: [],
      },
    }),
  );
  let failMonth = false;
  let failDay = false;
  let holdDay: Promise<void> | null = null;
  await page.route("**/api/workouts/activity?*", (route) => {
    if (failMonth) return route.abort();
    const month = new URL(route.request().url()).searchParams.get("month");
    const days =
      month === "2024-02"
        ? [
            {
              date: "2024-02-01",
              volume: 1500,
              set_count: 5,
              workout_count: 2,
            },
            {
              date: "2024-02-29",
              volume: 15300,
              set_count: 51,
              workout_count: 51,
            },
          ]
        : [];
    return route.fulfill({
      json: {
        month,
        metric: "volume",
        total_volume: days.reduce((sum, day) => sum + day.volume, 0),
        days,
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
        exercises: [
          {
            name: `${day}の種目${offset + i + 1}`,
            sets: Array.from({ length: day === "2024-02-01" ? (i === 0 ? 3 : 2) : 1 }, () => ({
              weight: 30,
              reps: 10,
            })),
          },
        ],
      })),
    });
  });
  await page.getByRole("navigation").getByRole("button", { name: "履歴", exact: true }).click();
  await expect(page.locator(".personal-history-summary")).toContainText("16,800");
  await chooseHistoryMonth(page, "2024-02");
  return {
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

const day = (page: Page, date: string) =>
  page
    .locator(".personal-history-calendar")
    .getByRole("button", { name: new RegExp(`^${date}、`) });
const closeDay = async (page: Page) => {
  await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
};

test("総負荷カレンダーから日付を選び、50件を超える日別記録もすべて確認する", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2024-03-01T03:00:00Z"));
  await activityFixture(page);
  await expect(day(page, "2024年2月29日")).toHaveAccessibleName(
    "2024年2月29日、15,300kg、51セット",
  );
  await day(page, "2024年2月29日").focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "2024年2月29日の全メニュー" });
  await expect(dialog.locator(".record")).toHaveCount(51);
  await expect(dialog).toContainText("2024-02-29の種目51");
  await closeDay(page);
  await day(page, "2024年2月2日").click();
  await expect(page.getByRole("dialog")).toContainText("この日の記録はありません");
  await closeDay(page);
  await day(page, "2024年2月1日").click();
  await expect(page.getByRole("dialog").locator(".record")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("月と日付の取得失敗を再試行し、閉じた日の遅い応答を表示しない", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2024-03-01T03:00:00Z"));
  const state = await activityFixture(page);
  state.failMonth(true);
  await moveHistoryMonth(page, -1);
  await expect(page.locator(".personal-history-calendar").getByRole("alert")).toContainText(
    "通信できません",
  );
  await expect(day(page, "2024年2月29日")).toHaveCount(0);
  state.failMonth(false);
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.locator(".personal-history-calendar-foot")).toContainText("0日");
  await chooseHistoryMonth(page, "2024-02");
  state.failDay(true);
  await day(page, "2024年2月29日").click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  state.failDay(false);
  await page.getByRole("dialog").getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".record")).toHaveCount(51);
  await closeDay(page);
  let release = () => {};
  state.holdDay(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  try {
    await day(page, "2024年2月1日").click();
    await expect(page.getByRole("dialog").locator(".record")).toHaveCount(0);
    await closeDay(page);
    await day(page, "2024年2月2日").click();
    release();
    await expect(page.getByRole("dialog")).toContainText("この日の記録はありません");
    await expect(page.getByRole("dialog").locator(".record")).toHaveCount(0);
  } finally {
    release();
  }
});

test("日本時間の今日まで選べ、未来の日付と最初の記録より前の月へ移動できない", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2024-02-10T15:00:00Z"));
  await activityFixture(page);
  await expect(day(page, "2024年2月11日")).toBeEnabled();
  await expect(day(page, "2024年2月12日")).toBeDisabled();
  const calendar = page.locator(".personal-history-calendar");
  await calendar.dispatchEvent("keydown", { key: "ArrowRight" });
  expect(await historyMonth(page)).toBe("2024-02");
  await moveHistoryMonth(page, -1);
  await calendar.dispatchEvent("keydown", { key: "ArrowLeft" });
  expect(await historyMonth(page)).toBe("2024-01");
});

test("日別シートを戻るで閉じても過去月を保持し、別の日へ記録を混ぜない", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2024-03-01T03:00:00Z"));
  await activityFixture(page);
  await day(page, "2024年2月29日").click();
  await expect(page.getByRole("dialog").locator(".record")).toHaveCount(51);
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await historyMonth(page)).toBe("2024-02");
  await moveHistoryMonth(page, -1);
  await chooseHistoryMonth(page, "2024-02");
  await day(page, "2024年2月1日").click();
  await expect(page.getByRole("dialog").locator(".record")).toHaveCount(2);
  await expect(page.getByRole("dialog")).not.toContainText("2024-02-29の種目51");
});
