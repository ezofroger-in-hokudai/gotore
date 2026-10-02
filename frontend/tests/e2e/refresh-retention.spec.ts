import { expect, test } from "./fixtures";
import { moveHistoryMonth } from "./history-period-helper";
import { emptyTodayActivity, mockTraining, navigate, openGroup } from "./mock-training";
import { mockHistoryCalendar, openHistoryDay } from "./personal-history-helper";

const retained = "更新できませんでした。前回の内容を表示しています。";

test("ホームとグループは一時失敗で保持し、再試行と権限喪失を区別する", async ({ page }) => {
  const state = await mockTraining(page);
  let status = 200;
  let today = 2;
  await page.route("**/api/groups/today-activity", (route) => {
    const activity = emptyTodayActivity([state.group]);
    activity.groups[0].today_count = today;
    activity.groups[0].totals = { set_count: 7, total_volume: 600 };
    activity.totals = activity.groups[0].totals;
    return route.fulfill({ status, json: status === 200 ? activity : { detail: "更新に失敗" } });
  });
  const alert = page.locator(".v2-app [role=alert]:visible");
  const home = page.locator(".group-carousel .community-card");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(home).toContainText("600kg");
  status = 503;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(alert).toContainText(retained);
  await expect(home).toContainText("600kg");
  status = 200;
  today = 4;
  await page.getByRole("button", { name: "今日の活動を再試行", exact: true }).click();
  await expect(alert).toHaveCount(0);
  await expect(home).toContainText("4人");
  await navigate(page, "グループ");
  const card = page.locator(".group-card-list .community-card");
  await expect(card).toContainText("600kg");
  status = 503;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(alert).toContainText(retained);
  await expect(card).toContainText("600kg");
  status = 403;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(card).not.toContainText("600kg");
  await expect(alert).not.toContainText(retained);
  status = 200;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(card).toContainText("600kg");
  await card.click();
  await expect(
    page.getByRole("heading", { name: state.group.name, level: 2, exact: true }),
  ).toBeVisible();
  let detailStatus = 503;
  await page.route(`**/api/groups/${state.group.id}`, (route) =>
    route.fulfill({ status: detailStatus, json: { detail: "グループ情報を取得できません" } }),
  );
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(alert.filter({ hasText: retained })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: state.group.name, level: 2, exact: true }),
  ).toBeVisible();
  detailStatus = 403;
  await alert
    .filter({ hasText: retained })
    .getByRole("button", { name: "再試行", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: state.group.name, level: 2, exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".community-feed:visible")).toHaveCount(0);
});

test("日別履歴とカレンダーは同じ取得先を保持し、別月と404では代用しない", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2024-03-01T03:00:00Z"));
  const state = await mockTraining(page, true, false, false);
  const record = {
    id: "kept",
    user_id: state.user.id,
    display_name: "本人",
    group_id: null,
    revision: 1,
    performed_on: "2024-02-01",
    created_at: "2024-02-01T00:00:00Z",
    exercises: [{ name: "保持する種目", sets: [{ weight: 60, reps: 10 }] }],
  };
  await mockHistoryCalendar(page, () => [
    record,
    { ...record, id: "older", performed_on: "2024-01-01" },
  ]);
  let status = 200;
  let calendarStatus = 200;
  await page.route("**/api/workouts?*", (route) =>
    route.fulfill({ status, json: status === 200 ? [record] : { detail: "履歴を取得できません" } }),
  );
  await page.route("**/api/workouts/activity?*", (route) =>
    calendarStatus === 200
      ? route.fallback()
      : route.fulfill({ status: calendarStatus, json: { detail: "カレンダーを取得できません" } }),
  );
  const calendar = page.locator(".personal-history-calendar");
  const footer = calendar.locator(".personal-history-calendar-foot");
  const detail = await openHistoryDay(page, record.performed_on);
  await expect(detail.locator(".record")).toContainText("保持する種目");
  await detail.getByRole("button", { name: "閉じる", exact: true }).click();
  status = 503;
  calendarStatus = 503;
  await navigate(page, "設定");
  await navigate(page, "履歴");
  await expect(calendar.getByRole("alert")).toContainText(retained);
  await expect(footer).toContainText("600kg");
  await openHistoryDay(page, record.performed_on);
  await expect(detail.getByRole("alert")).toContainText(retained);
  await expect(detail.locator(".record")).toContainText("保持する種目");
  await detail.getByRole("button", { name: "閉じる", exact: true }).click();
  await moveHistoryMonth(page, -1);
  await expect(footer).not.toContainText("600kg");
  status = 404;
  calendarStatus = 200;
  await moveHistoryMonth(page, 1);
  await expect(calendar.getByRole("alert")).toHaveCount(0);
  await openHistoryDay(page, record.performed_on);
  await expect(detail.getByRole("alert")).toContainText("履歴を取得できません");
  await expect(detail.locator(".record")).toHaveCount(0);
  status = 200;
  await detail.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(detail.locator(".record")).toContainText("保持する種目");
  await expect(detail.getByRole("alert")).toHaveCount(0);
});

test("グループグラフは503で保持し、非表示中は更新せず404で消去する", async ({ page }) => {
  await page.clock.install();
  await mockTraining(page);
  let status = 200;
  let volume = 600;
  let reads = 0;
  await page.route(/\/api\/groups\/[^/]+\/analytics\?/, (route) => {
    const url = new URL(route.request().url());
    if (
      url.searchParams.get("period") === "all" &&
      url.searchParams.get("offset") === "0" &&
      !url.searchParams.get("exercise")
    )
      reads++;
    const totals = { volume, sets: 1, days: 1, people: 1, weight: null, rm: null };
    return route.fulfill({
      status,
      json:
        status === 200
          ? {
              window: {
                period: "all",
                offset: 0,
                start: "2026-09-01",
                end: "2026-09-30",
                previous_start: null,
                previous_end: null,
                can_previous: false,
              },
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
  const panel = page.locator(".group-history-graph");
  await expect(panel.locator(".personal-history-graph-value")).toContainText("600");
  status = 503;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(panel.getByRole("alert")).toContainText(retained);
  await expect(panel.getByRole("img")).toBeVisible();
  status = 200;
  volume = 900;
  await panel.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(panel.locator(".personal-history-graph-value")).toContainText("900");
  await navigate(page, "設定");
  const before = reads;
  await page.clock.runFor(65000);
  expect(reads).toBe(before);
  status = 404;
  await openGroup(page);
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "グラフ", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("集計を取得できません");
  await expect(panel.getByRole("img")).toHaveCount(0);
  await expect(panel.locator(".personal-history-graph-value")).toContainText("—");
  await expect(panel.locator(".personal-history-graph-value")).not.toContainText("900");
});
