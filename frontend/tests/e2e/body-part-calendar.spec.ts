import { expect, test } from "./fixtures";
import { chooseHistoryMonth, moveHistoryMonth } from "./history-period-helper";
import { mockTraining, navigate } from "./mock-training";

test.use({ locale: "ja-JP" });

test("日付の部位・横一列の絞り込み・日別内訳を追加通信なしで表示する", async ({ page }) => {
  // 定期更新タイマーが作られる前に止め、部位操作による通信だけを数える。
  const clockTime = new Date("2024-03-01T03:00:00Z");
  await page.clock.install({ time: clockTime });
  await page.clock.pauseAt(clockTime);
  const state = await mockTraining(page, true, false, false);
  state.finished = [
    {
      id: "calendar-13",
      user_id: state.user.id,
      display_name: "画面テスト",
      group_id: null,
      performed_on: "2024-02-13",
      created_at: "2024-02-13T03:00:00Z",
      revision: 1,
      started_at: "2024-02-13T02:30:00Z",
      ended_at: "2024-02-13T03:00:00Z",
      exercises: [
        { name: "ベンチプレス", sets: Array.from({ length: 3 }, () => ({ weight: 65, reps: 10 })) },
        { name: "ペックフライ", sets: Array.from({ length: 3 }, () => ({ weight: 40, reps: 12 })) },
        {
          name: "ショルダープレス",
          sets: Array.from({ length: 3 }, () => ({ weight: 12, reps: 10 })),
        },
      ],
    },
    {
      id: "calendar-11",
      user_id: state.user.id,
      display_name: "画面テスト",
      group_id: null,
      performed_on: "2024-02-11",
      created_at: "2024-02-11T03:00:00Z",
      started_at: "2024-02-11T02:30:00Z",
      ended_at: "2024-02-11T03:00:00Z",
      revision: 1,
      exercises: [
        {
          name: "以前の自重種目",
          sets: Array.from({ length: 3 }, () => ({ weight: 0, reps: 10 })),
        },
      ],
    },
  ];
  await page.route("**/api/workouts?*", (route) => {
    const date = new URL(route.request().url()).searchParams.get("performed_on");
    return route.fulfill({
      json: state.finished.filter((record) => !date || record.performed_on === date),
    });
  });
  let requests = 0;
  let fail = false;
  await page.route("**/api/workouts/activity?*", (route) => {
    requests++;
    const month = new URL(route.request().url()).searchParams.get("month");
    return route.fulfill({
      status: fail ? 503 : 200,
      json: fail
        ? { detail: "再試行してください" }
        : {
            month,
            metric: "volume",
            total_volume: month === "2024-02" ? 3750 : 0,
            total_sets: month === "2024-02" ? 12 : 0,
            workout_count: month === "2024-02" ? 2 : 0,
            active_days: month === "2024-02" ? 2 : 0,
            days:
              month === "2024-02"
                ? [
                    {
                      date: "2024-02-13",
                      volume: 3750,
                      set_count: 9,
                      workout_count: 1,
                      workout_groups: [{ body_parts: ["chest", "shoulders"], workout_count: 1 }],
                      body_parts: [
                        { body_part: "chest", volume: 3390, set_count: 6, workout_count: 1 },
                        { body_part: "shoulders", volume: 360, set_count: 3, workout_count: 1 },
                      ],
                    },
                    {
                      date: "2024-02-11",
                      volume: 0,
                      set_count: 3,
                      workout_count: 1,
                      workout_groups: [{ body_parts: ["other"], workout_count: 1 }],
                      body_parts: [
                        { body_part: "other", volume: 0, set_count: 3, workout_count: 1 },
                      ],
                    },
                  ]
                : [],
          },
    });
  });
  await page.route("**/api/history/summary", (route) =>
    route.fulfill({
      json: {
        first_performed_on: "2024-01-01",
        total_volume: 3750,
        total_sets: 12,
        workout_count: 2,
        exercises: [],
      },
    }),
  );
  await navigate(page, "履歴");
  await expect(page.locator(".personal-history-summary")).toContainText("3,750");
  await chooseHistoryMonth(page, "2024-02");
  const calendar = page.locator(".personal-history-calendar");
  const filters = page.locator(".personal-history-part-tabs");
  const before = requests;
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const tops = await filters
      .getByRole("button")
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
    expect(new Set(tops).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await filters.getByRole("button", { name: "肩", exact: true }).click();
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText("360kg");
  await expect(
    calendar.getByRole("button", { name: "2024年2月13日、360kg、3セット", exact: true }),
  ).toBeVisible();
  await calendar.getByRole("button", { name: /^2024年2月13日、/ }).click();
  await expect(page.getByRole("dialog")).toContainText("ベンチプレス");
  await expect(page.getByRole("dialog")).toContainText("ショルダープレス");
  await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await filters.getByRole("button", { name: "その他", exact: true }).click();
  await expect(
    calendar.getByRole("button", { name: "2024年2月11日、0kg、3セット", exact: true }),
  ).toHaveAttribute("data-level", "1");
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText("1日");
  await filters.getByRole("button", { name: "すべて", exact: true }).click();
  expect(requests).toBe(before);
  await page.clock.resume();
  await moveHistoryMonth(page, -1);
  fail = true;
  await moveHistoryMonth(page, 1);
  await expect(calendar.getByRole("alert")).toContainText("更新できませんでした");
  await expect(
    calendar.getByRole("button", { name: "2024年2月13日、3,750kg、9セット", exact: true }),
  ).toBeVisible();
  fail = false;
  await calendar.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(calendar.getByRole("alert")).toHaveCount(0);
});

test("内訳のない旧応答へ切り替わったとき、0件にせず全体を表示する", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2024-02-28T03:00:00Z"));
  await mockTraining(page, true, false, false);
  await page.route("**/api/history/summary", (route) =>
    route.fulfill({
      json: {
        first_performed_on: "2024-02-01",
        total_volume: 600,
        total_sets: 3,
        workout_count: 1,
        exercises: [],
      },
    }),
  );
  let legacy = false;
  await page.route("**/api/workouts/activity?*", (route) =>
    route.fulfill({
      json: {
        month: "2024-02",
        metric: "volume",
        total_volume: 600,
        total_sets: 3,
        workout_count: 1,
        active_days: 1,
        days: [
          {
            date: "2024-02-13",
            volume: 600,
            set_count: 3,
            workout_count: 1,
            ...(legacy
              ? {}
              : {
                  body_parts: [{ body_part: "chest", volume: 600, set_count: 3, workout_count: 1 }],
                }),
          },
        ],
      },
    }),
  );
  await navigate(page, "履歴");
  await expect(page.locator(".personal-history-summary")).toContainText("600");
  const calendar = page.locator(".personal-history-calendar");
  const filters = page.locator(".personal-history-part-tabs");
  await filters.getByRole("button", { name: "胸", exact: true }).click();
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText("600kg");
  legacy = true;
  await page.getByRole("tab", { name: "グラフ" }).click();
  await page.getByRole("tab", { name: "カレンダー" }).click();
  await expect(filters.getByRole("button", { name: "胸", exact: true })).toBeDisabled();
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText(
    "全種目 · 1日600kg",
  );
});
