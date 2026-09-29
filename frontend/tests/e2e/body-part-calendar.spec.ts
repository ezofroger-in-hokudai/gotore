import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("個人カレンダーは部位を切り替えても月データを再取得せず、0kgの活動も残す", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2024-02-29T03:00:00Z"));
  await mockTraining(page);
  await page.route("**/api/history/summary", (route) =>
    route.fulfill({
      json: {
        workout_count: 2,
        total_sets: 12,
        total_volume: 3750,
        first_performed_on: "2024-02-11",
        exercises: [],
      },
    }),
  );
  let requests = 0;
  await page.route("**/api/workouts/activity?*", (route) => {
    requests++;
    return route.fulfill({
      json: {
        month: "2024-02",
        metric: "volume",
        total_volume: 3750,
        total_sets: 12,
        workout_count: 2,
        active_days: 2,
        days: [
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
            body_parts: [{ body_part: "other", volume: 0, set_count: 3, workout_count: 1 }],
          },
        ],
      },
    });
  });
  await navigate(page, "履歴");
  const calendar = page.locator(".personal-history-calendar");
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText("3,750kg");
  const before = requests;
  const filters = page.locator(".personal-history-part-tabs");
  await filters.getByRole("button", { name: "肩", exact: true }).click();
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText("肩全体 · 1日");
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText("360kg");
  await filters.getByRole("button", { name: "胸", exact: true }).click();
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText("3,390kg");
  await expect(filters.getByRole("button", { name: "肩", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await filters.getByRole("button", { name: "その他", exact: true }).click();
  await expect(calendar.getByRole("button", { name: /2024年2月11日、0kg、3セット/ })).toBeVisible();
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText(
    "その他全体 · 1日",
  );
  await filters.getByRole("button", { name: "背中", exact: true }).click();
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText("背中全体 · 0日");
  expect(requests).toBe(before);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});
