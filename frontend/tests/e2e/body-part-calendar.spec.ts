import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test.use({ locale: "ja-JP" });

test("日付の部位・横一列の絞り込み・日別内訳を追加通信なしで表示する", async ({ page }) => {
  // 定期更新タイマーが作られる前に止め、部位操作による通信だけを数える。
  const clockTime = new Date();
  await page.clock.install({ time: clockTime });
  await page.clock.pauseAt(clockTime);
  const state = await mockTraining(page);
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
  await navigate(page, "履歴");
  const calendar = page.getByRole("region", { name: "活動カレンダー", exact: true });
  await calendar.getByLabel("月", { exact: true }).fill("2024-02");
  const day = calendar.getByRole("button", {
    name: "2024年2月13日、総負荷3,750kg、1件、胸・肩",
    exact: true,
  });
  await expect(day.locator(".activity-day-part")).toHaveText("胸+1");
  await expect(calendar.getByRole("heading", { name: "総負荷カレンダー" })).toHaveCount(0);
  await page.getByRole("heading", { name: "履歴", exact: true }).click();
  const filters = calendar.getByRole("group", { name: "カレンダーの部位", exact: true });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const tops = await filters
      .getByRole("button")
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
    expect(new Set(tops).size).toBe(1);
    await expect(filters.getByRole("button")).toHaveText([
      "すべて",
      "胸",
      "背中",
      "脚",
      "腕",
      "肩",
      "腹筋",
      "お尻",
      "その他",
    ]);
    for (const button of await filters.getByRole("button").all()) {
      expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
    }
    expect(await filters.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    for (const cell of await calendar.locator(".activity-day-part").all()) {
      expect(await cell.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
    }
    await page.screenshot({ path: `test-results/body-part-calendar-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await day.click();
  const detail = page.getByRole("region", { name: "2024年2月13日の部位内訳", exact: true });
  await expect(detail).toContainText("6セット · 3,390kg");
  await expect(detail).toContainText("3セット · 360kg");
  await page.screenshot({ path: "test-results/body-part-calendar-detail.png", fullPage: true });
  const before = requests;
  await filters.getByRole("button", { name: "肩", exact: true }).click();
  await expect(calendar.locator(".activity-totals")).toContainText("360");
  await expect(detail).toHaveCount(0);
  await expect(
    calendar.getByRole("button", { name: /2024年2月13日、/ }).locator(".activity-day-part"),
  ).toHaveText("肩");
  await filters.getByRole("button", { name: "胸", exact: true }).click();
  await expect(filters.getByRole("button", { name: "胸", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(filters.getByRole("button", { name: "肩", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(filters.getByRole("button", { name: "すべて", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(calendar.locator(".activity-totals")).toContainText("3,750kg活動日数1日記録件数1件");
  await expect(day).toBeVisible();
  await expect(calendar.locator(".activity-legend")).toHaveCount(0);
  await expect(calendar.getByText("主部位の内訳", { exact: true })).toHaveCount(0);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const positions = await filters
      .getByRole("button")
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
    expect(new Set(positions).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: `test-results/calendar-multi-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await filters.getByRole("button", { name: "胸", exact: true }).click();
  await expect(calendar.locator(".activity-totals")).toContainText("360kg");
  await filters.getByRole("button", { name: "肩", exact: true }).click();
  await expect(filters.getByRole("button", { name: "すべて", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await filters.getByRole("button", { name: "その他", exact: true }).click();
  await expect(filters.getByRole("button", { name: "その他", exact: true })).toBeInViewport();
  const zero = calendar.getByRole("button", {
    name: "2024年2月11日、総負荷0kg、1件、その他",
    exact: true,
  });
  await expect(zero).toHaveAttribute("data-volume", "0");
  await expect(calendar.locator(".activity-totals")).toContainText("1日");
  await filters.getByRole("button", { name: "すべて", exact: true }).click();
  await filters.getByRole("button", { name: "背中", exact: true }).click();
  await expect(calendar.getByText("この月の背中は記録なし", { exact: true })).toBeVisible();
  await filters.getByRole("button", { name: "すべて", exact: true }).click();
  await expect(day).toBeVisible();
  expect(requests).toBe(before);
  await page.clock.resume();
  await day.click();
  await calendar.getByRole("button", { name: "前の月", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await expect(calendar.getByText("この月は記録なし", { exact: true })).toBeVisible();
  fail = true;
  await calendar.getByRole("button", { name: "次の月", exact: true }).click();
  await expect(calendar.getByRole("alert")).toContainText("再試行してください");
  await expect(day).toHaveCount(0);
  fail = false;
  await calendar.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(day).toBeVisible();
});

test("内訳のない旧応答へ切り替わったとき、0件にせず全体を表示する", async ({ page }) => {
  await mockTraining(page);
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
  const calendar = page.getByRole("region", { name: "活動カレンダー", exact: true });
  await calendar.getByLabel("月", { exact: true }).fill("2024-02");
  const filters = calendar.getByRole("group", { name: "カレンダーの部位", exact: true });
  await filters.getByRole("button", { name: "胸", exact: true }).click();
  await expect(calendar.locator(".activity-totals")).toContainText("総負荷");
  legacy = true;
  await expect(filters.getByRole("button", { name: "胸", exact: true })).toBeDisabled();
  await expect(filters.getByRole("button", { name: "すべて", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(calendar.locator(".activity-totals")).toContainText("600");
  await expect(calendar.locator(".activity-totals")).toContainText("総負荷");
});
