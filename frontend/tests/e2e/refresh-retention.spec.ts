import { expect, test } from "@playwright/test";
import { mockTraining, navigate, openGroup } from "./mock-training";

const retained = "更新できませんでした。前回の内容を表示しています。";

test("ホームとグループは一時失敗で保持し、再試行と権限喪失を区別する", async ({ page }) => {
  const state = await mockTraining(page);
  let status = 200;
  let today = 2;
  await page.route("**/api/groups/today-activity", (route) =>
    route.fulfill({
      status,
      json:
        status === 200
          ? {
              totals: { set_count: today, total_volume: today * 600 },
              groups: [
                {
                  group_id: state.group.id,
                  name: state.group.name,
                  member_count: 3,
                  live_count: 0,
                  today_count: today,
                  members: [],
                  totals: { set_count: today, total_volume: today * 600 },
                  feed: [
                    {
                      workout_id: "kept",
                      user_id: "friend",
                      display_name: "保持する仲間",
                      exercise: "ベンチプレス",
                      weight: 60,
                      reps: 10,
                      updated_at: new Date().toISOString(),
                      best: false,
                      summary: { exercise_count: 1, set_count: 1, total_volume: 600 },
                    },
                  ],
                },
              ],
            }
          : { detail: "更新に失敗" },
    }),
  );
  await page.route(`**/api/groups/${state.group.id}/activity`, (route) =>
    route.fulfill({
      status,
      json:
        status === 200
          ? {
              group_id: state.group.id,
              member_count: 3,
              live_count: 0,
              today_count: today,
              members: [],
              feed: [
                {
                  workout_id: "kept",
                  user_id: "friend",
                  display_name: "保持する仲間",
                  exercise: "ベンチプレス",
                  weight: 60,
                  reps: 10,
                  updated_at: new Date().toISOString(),
                  best: false,
                },
              ],
            }
          : { detail: "更新に失敗" },
    }),
  );
  await page.route(`**/api/groups/${state.group.id}/workouts/kept`, (route) =>
    route.fulfill({
      json: {
        id: "kept",
        user_id: "friend",
        display_name: "保持する仲間",
        performed_on: "2026-09-29",
        created_at: new Date().toISOString(),
        revision: 1,
        exercises: [{ name: "ベンチプレス", sets: [{ weight: 60, reps: 10 }] }],
      },
    }),
  );
  await page.reload();
  await expect(page.locator(".community-feed:visible")).toContainText("保持する仲間");
  status = 503;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText(retained);
  await expect(page.locator(".community-feed:visible")).toContainText("保持する仲間");
  if (process.env.REFRESH_SCREENSHOTS) {
    await page.screenshot({
      path: "../docs/images/refresh-retention/home-stale.png",
      fullPage: true,
    });
  }
  status = 200;
  today = 4;
  await page.getByRole("button", { name: "今日の活動を再試行", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".group-carousel .community-card")).toContainText("4");
  await openGroup(page);
  await expect(page.locator(".community-feed:visible")).toContainText("保持する仲間");
  status = 503;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText(retained);
  await expect(page.locator(".community-feed:visible")).toContainText("保持する仲間");
  status = 403;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.locator(".community-feed:visible")).toHaveCount(0);
  await expect(page.locator(".v2-app").getByRole("alert")).not.toContainText(retained);
  status = 200;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.locator(".community-feed:visible")).toContainText("保持する仲間");
  let detailStatus = 503;
  await page.route(`**/api/groups/${state.group.id}`, (route) =>
    route.fulfill({ status: detailStatus, json: { detail: "グループ情報を取得できません" } }),
  );
  await navigate(page, "設定");
  await openGroup(page);
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText(retained);
  await expect(
    page.getByRole("heading", { name: state.group.name, level: 2, exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "グループの表示" })
      .getByRole("button", { name: "設定", exact: true }),
  ).toBeVisible();
  detailStatus = 403;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: state.group.name, level: 2, exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".community-feed:visible")).toHaveCount(0);
});

test("履歴カレンダーは前回表示を保持し、別月と404では代用しない", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2024-02-01T03:00:00Z"));
  await mockTraining(page);
  await page.route("**/api/history/summary", (route) =>
    route.fulfill({
      json: {
        workout_count: 1,
        total_sets: 1,
        total_volume: 600,
        first_performed_on: "2024-01-01",
        exercises: [],
      },
    }),
  );
  let calendarStatus = 200;
  await page.route("**/api/workouts/activity?*", (route) =>
    route.fulfill({
      status: calendarStatus,
      json:
        calendarStatus === 200
          ? {
              month: new URL(route.request().url()).searchParams.get("month"),
              metric: "volume",
              total_volume: 600,
              days: [
                {
                  date: `${new URL(route.request().url()).searchParams.get("month")}-01`,
                  volume: 600,
                  set_count: 1,
                  workout_count: 1,
                },
              ],
              total_sets: 1,
              workout_count: 1,
              active_days: 1,
            }
          : { detail: "カレンダーを取得できません" },
    }),
  );
  await navigate(page, "履歴");
  const calendar = page.locator(".personal-history-calendar");
  const day = calendar.locator('button[aria-label*="2月1日"]');
  await expect(day).toHaveAttribute("aria-label", /600kg/);
  calendarStatus = 503;
  await navigate(page, "設定");
  await navigate(page, "履歴");
  await expect(
    page.locator(".v2-app").getByRole("alert").filter({ hasText: retained }),
  ).toHaveCount(1);
  await expect(day).toHaveAttribute("aria-label", /600kg/);
  await calendar.evaluate((element: HTMLElement) => {
    element.tabIndex = 0;
  });
  await calendar.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(day).toHaveCount(0);
  await calendar.focus();
  await page.keyboard.press("ArrowRight");
  await expect(day).toHaveAttribute("aria-label", /600kg/);
  calendarStatus = 404;
  await navigate(page, "設定");
  await navigate(page, "履歴");
  await expect(day).not.toHaveAttribute("aria-label", /600kg/);
  calendarStatus = 200;
  const retries = page.getByRole("button", { name: "再試行", exact: true });
  while (await retries.count()) await retries.first().click();
  await expect(day).toHaveAttribute("aria-label", /600kg/);
  await expect(page.locator(".v2-app").getByRole("alert")).toHaveCount(0);
});

test("グループグラフも503では集計を保持し、非表示中は更新せず404で消去する", async ({ page }) => {
  await mockTraining(page);
  let status = 200;
  let volume = 600;
  let reads = 0;
  await page.route(/\/api\/groups\/[^/]+\/analytics\?/, (route) => {
    reads++;
    const totals = { volume, sets: 1, days: 1, people: 1, weight: null, rm: null };
    return route.fulfill({
      status,
      json:
        status === 200
          ? {
              window: { period: "all", start: "2026-09-01", end: "2026-09-30" },
              exercise: null,
              exercises: [],
              totals,
              previous_totals: null,
              series: { month: [{ ...totals, start: "2026-09-01", end: "2026-09-30" }] },
              rankings: {},
            }
          : { detail: "集計を取得できません" },
    });
  });
  await openGroup(page);
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "グラフ", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "グループの記録の推移" });
  await expect(panel.locator(".personal-history-graph-value")).toContainText("600");
  status = 503;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => reads).toBeGreaterThan(1);
  await expect(panel.locator(".personal-history-graph-value")).toContainText("600");
  await expect(panel.getByRole("img", { name: "総負荷の推移" })).toBeVisible();
  status = 200;
  volume = 900;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(panel.locator(".personal-history-graph-value")).toContainText("900");
  await navigate(page, "設定");
  const before = reads;
  await page.waitForTimeout(5500);
  expect(reads).toBe(before);
  status = 404;
  await openGroup(page);
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "グラフ", exact: true })
    .click();
  await expect(panel.getByRole("button", { name: "グラフを取得できません。再試行" })).toBeVisible();
  await expect(panel.getByRole("img", { name: "総負荷の推移" })).toHaveCount(0);
});
