import { expect, test } from "@playwright/test";
import { mockTraining, navigate, openGroup } from "./mock-training";

const retained = "更新できませんでした。前回の内容を表示しています。";

test("ホームとグループは一時失敗で保持し、再試行と権限喪失を区別する", async ({ page }) => {
  const state = await mockTraining(page);
  let status = 200;
  let today = 2;
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
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(".community-feed")).toContainText("保持する仲間");
  status = 503;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText(retained);
  await expect(page.locator(".community-feed")).toContainText("保持する仲間");
  if (process.env.REFRESH_SCREENSHOTS) {
    await page.screenshot({
      path: "../docs/images/refresh-retention/home-stale.png",
      fullPage: true,
    });
  }
  status = 200;
  today = 4;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".community-stats")).toContainText("4");
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
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText(retained);
  await expect(
    page.getByRole("heading", { name: state.group.name, level: 1, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^メンバー一覧/ })).toBeVisible();
  detailStatus = 403;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: state.group.name, level: 1, exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".community-feed:visible")).toHaveCount(0);
});

test("履歴とカレンダーは同じ取得先の値を保持し、別月と404では代用しない", async ({ page }) => {
  const state = await mockTraining(page);
  let status = 200;
  await page.route("**/api/workouts?*", (route) =>
    route.fulfill({
      status,
      json:
        status === 200
          ? [
              {
                id: "kept",
                user_id: state.user.id,
                display_name: "本人",
                performed_on: "2024-02-01",
                created_at: "2024-02-01T00:00:00Z",
                exercises: [{ name: "保持する種目", sets: [{ weight: 60, reps: 10 }] }],
              },
            ]
          : { detail: "履歴を取得できません" },
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
              metric: "score",
              best_score: 96,
              days: [],
              total_sets: 3,
              workout_count: 1,
              active_days: 1,
            }
          : { detail: "カレンダーを取得できません" },
    }),
  );
  await navigate(page, "履歴");
  await expect(page.locator(".history-row")).toContainText("保持する種目");
  await expect(page.locator(".activity-totals")).toContainText("96");
  status = 503;
  calendarStatus = 503;
  await navigate(page, "設定");
  await navigate(page, "履歴");
  await expect(
    page.locator(".v2-app").getByRole("alert").filter({ hasText: retained }),
  ).toHaveCount(2);
  await expect(page.locator(".history-row")).toContainText("保持する種目");
  await expect(page.locator(".activity-totals")).toContainText("96");
  await page.getByRole("button", { name: "前の月", exact: true }).click();
  await expect(page.locator(".activity-totals")).not.toContainText("96");
  status = 404;
  await navigate(page, "設定");
  await navigate(page, "履歴");
  await expect(page.locator(".history-row")).toHaveCount(0);
  status = 200;
  calendarStatus = 200;
  const retries = page.getByRole("button", { name: "再試行", exact: true });
  while (await retries.count()) await retries.first().click();
  await expect(page.locator(".history-row")).toContainText("保持する種目");
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
              window: {
                period: "week",
                offset: 0,
                start: "2026-09-07",
                end: "2026-09-13",
                previous_start: null,
                previous_end: null,
                can_previous: false,
              },
              exercise: null,
              exercises: [],
              totals,
              previous_totals: null,
              series: { day: [{ ...totals, start: "2026-09-07", end: "2026-09-07" }] },
              rankings: {},
            }
          : { detail: "集計を取得できません" },
    });
  });
  await openGroup(page);
  await page.getByRole("button", { name: "グラフ", exact: true }).click();
  const panel = page.getByRole("region", { name: "グループ集計" });
  await expect(panel.locator(".analytics-summary")).toContainText("600");
  status = 503;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(panel.getByRole("alert")).toContainText(retained);
  await expect(panel.getByRole("img")).toBeVisible();
  status = 200;
  volume = 900;
  await panel.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(panel.locator(".analytics-summary")).toContainText("900");
  await navigate(page, "設定");
  const before = reads;
  await page.waitForTimeout(5500);
  expect(reads).toBe(before);
  status = 404;
  await openGroup(page);
  await page.getByRole("button", { name: "グラフ", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("集計を取得できません");
  await expect(panel.getByRole("img")).toHaveCount(0);
  await expect(panel.locator(".analytics-summary")).toHaveCount(0);
});
