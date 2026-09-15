import { expect, test } from "@playwright/test";
import { addDays, frameEnd, shiftAnchor } from "../../src/features/analytics/period";
import type { Grain, Point } from "../../src/features/analytics/types";
import { mockTraining, navigate, openGroup } from "./mock-training";

test("統一履歴で週の7枠・活動日数・人数・メンバー・直接記録・スワイプを確認する", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-15T03:00:00Z"));
  const state = await mockTraining(page);
  const rows = ["2026-09-07", "2026-09-11", "2026-09-14", "2026-09-15"].flatMap((date, i) =>
    [state.user.id, "friend"].map((user, j) => ({
      id: `record-${i}-${j}`,
      user_id: user,
      display_name: j ? "ハル" : "トオル",
      performed_on: date,
      created_at: `${date}T00:00:00Z`,
      group_id: null,
      exercises: [{ name: "ベンチプレス", sets: [{ weight: 60 + j * 20, reps: 10 }] }],
    })),
  );
  const totals = (data: typeof rows, exercise: string | null) => ({
    sets: data.length,
    volume: data.reduce((n, r) => n + r.exercises[0].sets[0].weight * 10, 0),
    days: new Set(data.map((r) => r.performed_on)).size,
    people: new Set(data.map((r) => r.user_id)).size,
    weight:
      exercise && data.length ? Math.max(...data.map((r) => r.exercises[0].sets[0].weight)) : null,
    rm:
      exercise && data.length
        ? Math.max(...data.map((r) => r.exercises[0].sets[0].weight)) * 1.3
        : null,
  });
  let deny = false;
  const recordQueries: string[] = [];
  await page.route(/\/api\/(groups\/[^/]+\/)?analytics\?/, (route) => {
    if (deny) return route.fulfill({ status: 404, json: { detail: "グループに参加していません" } });
    const url = new URL(route.request().url());
    const group = url.pathname.includes("groups");
    const period = (url.searchParams.get("period") ?? "month") as
      | "week"
      | "month"
      | "quarter"
      | "year"
      | "all";
    const anchor = url.searchParams.get("anchor") ?? "2026-09-15";
    const exercise = url.searchParams.get("exercise");
    const member = url.searchParams.get("member_id");
    const start =
      period === "week"
        ? addDays(anchor, -((new Date(anchor).getUTCDay() + 6) % 7))
        : period === "all"
          ? "2026-09-01"
          : period === "month"
            ? `${anchor.slice(0, 7)}-01`
            : shiftAnchor(shiftAnchor(anchor, period, -1), "month", 1);
    const end = frameEnd(anchor, period) < "2026-09-15" ? frameEnd(anchor, period) : "2026-09-15";
    const selected = rows.filter(
      (r) =>
        (group || r.user_id === state.user.id) &&
        (!member || r.user_id === member) &&
        r.performed_on >= start &&
        r.performed_on <= end,
    );
    const series: Partial<Record<Grain, Point[]>> = {};
    for (const grain of ["day", "week", "month"] as const) {
      const list: Point[] = [];
      let cursor = start;
      while (cursor <= end) {
        let stop =
          grain === "day"
            ? cursor
            : grain === "week"
              ? frameEnd(cursor, "week")
              : frameEnd(cursor, "month");
        if (stop > end) stop = end;
        list.push({
          start: cursor,
          end: stop,
          ...totals(
            selected.filter((r) => r.performed_on >= cursor && r.performed_on <= stop),
            exercise,
          ),
        });
        cursor = addDays(stop, 1);
      }
      series[grain] = list;
    }
    return route.fulfill({
      json: {
        window: {
          period,
          offset: 0,
          start,
          end,
          previous_start: null,
          previous_end: null,
          can_previous: true,
        },
        exercise,
        exercises: ["ベンチプレス"],
        totals: totals(selected, exercise),
        previous_totals: null,
        series,
        rankings: {},
      },
    });
  });
  await page.route(/\/api\/(groups\/[^/]+\/)?workouts\?/, (route) => {
    const url = new URL(route.request().url());
    recordQueries.push(url.search);
    if (deny) return route.fulfill({ status: 404, json: { detail: "グループに参加していません" } });
    return route.fulfill({
      json: rows.filter(
        (r) =>
          (url.pathname.includes("groups") || r.user_id === state.user.id) &&
          (!url.searchParams.get("member_id") || r.user_id === url.searchParams.get("member_id")) &&
          r.performed_on >= (url.searchParams.get("date_from") ?? "2000-01-01") &&
          r.performed_on <= (url.searchParams.get("date_to") ?? "2026-09-15"),
      ),
    });
  });
  await page.route(/\/api\/groups\/[^/]+\/workouts\/activity\?/, (route) =>
    route.fulfill({
      json: {
        month: "2026-09",
        total_volume: 5600,
        total_sets: 8,
        workout_count: 8,
        active_days: 4,
        days: [
          {
            date: "2026-09-15",
            volume: 1400,
            set_count: 2,
            workout_count: 2,
            body_parts: [{ body_part: "chest", volume: 1400, set_count: 2, workout_count: 2 }],
            workout_groups: [{ body_parts: ["chest"], workout_count: 2 }],
          },
        ],
      },
    }),
  );
  await navigate(page, "履歴");
  await page.getByRole("button", { name: "グラフ", exact: true }).click();
  const panel = page.getByRole("region", { name: "履歴グラフ" });
  await panel.getByRole("combobox", { name: "期間", exact: true }).selectOption("week");
  await expect(panel.locator(".chart-bar")).toHaveCount(2);
  await expect(panel.locator(".chart-future")).toHaveCount(5);
  await expect(panel.getByRole("button", { name: "週別", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/unified-personal-graph.png", fullPage: true });
  await expect(page.locator(".history-period-records:visible")).toContainText("2026/09/15");
  await expect.poll(() => recordQueries.some((q) => q.includes("date_from=2026-09-15"))).toBe(true);
  await panel.getByRole("button", { name: "活動日数", exact: true }).click();
  await expect(panel.locator(".activity-week button")).toHaveCount(7);
  await expect(panel.locator(".analytics-summary")).toContainText("2");
  await page.screenshot({ path: "test-results/unified-personal-week.png", fullPage: true });
  const cdp = await page.context().newCDPSession(page);
  async function swipe(dx: number, cancel = false) {
    await panel.locator(".activity-week").scrollIntoViewIfNeeded();
    const box = await panel.locator(".activity-week").boundingBox();
    if (!box) throw Error("missing chart");
    const x = box.x + (dx > 0 ? 0.2 : 0.8) * box.width;
    const y = box.y + 40;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 6; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + (dx * i) / 6, y }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: cancel ? "touchCancel" : "touchEnd",
      touchPoints: [],
    });
  }
  await swipe(160);
  await expect(panel.locator(".analytics-period")).toContainText("2026/09/07");
  await expect(panel.locator(".activity-week button:disabled")).toHaveCount(0);
  await swipe(-160, true);
  await expect(panel.locator(".analytics-period")).toContainText("2026/09/07");
  await panel.getByRole("button", { name: "現在に戻る", exact: true }).click();
  await panel.getByRole("combobox", { name: "期間", exact: true }).selectOption("year");
  await expect(panel.getByRole("button", { name: "日別", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "月別", exact: true })).toBeVisible();
  await openGroup(page);
  await page.getByRole("button", { name: "カレンダー", exact: true }).click();
  await expect(page.locator(".community-screen .activity-totals")).toContainText("5,600");
  await page.screenshot({ path: "test-results/unified-group-calendar.png", fullPage: true });
  await page.getByRole("button", { name: "グラフ", exact: true }).click();
  const groupPanel = page.getByRole("region", { name: "グループ集計" });
  await groupPanel.getByRole("combobox", { name: "期間", exact: true }).selectOption("week");
  await groupPanel.getByRole("button", { name: "活動人数", exact: true }).click();
  await expect(groupPanel.locator(".analytics-summary")).toContainText("2");
  await groupPanel
    .getByRole("combobox", { name: "種目", exact: true })
    .selectOption("ベンチプレス");
  await expect(groupPanel.getByRole("button", { name: "最高重量", exact: true })).toHaveCount(0);
  await groupPanel
    .getByRole("combobox", { name: "メンバー", exact: true })
    .selectOption(state.user.id);
  await groupPanel.getByRole("button", { name: "最高重量", exact: true }).click();
  await expect(groupPanel.locator(".analytics-summary")).toContainText("60");
  await expect(page.locator(".community-screen .history-period-records")).not.toContainText("ハル");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({ path: "test-results/unified-group-weight.png", fullPage: true });
  deny = true;
  await groupPanel.getByRole("combobox", { name: "期間", exact: true }).selectOption("all");
  await expect(groupPanel.getByRole("alert")).toContainText("参加していません");
  await expect(page.locator(".community-screen .history-period-records")).toBeHidden();
});
