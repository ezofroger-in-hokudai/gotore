import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("ホームの振り返り欄を省き、記録は履歴の日付から全件確認できる", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-11T03:00:00Z"));
  const state = await mockTraining(page);
  const records = [11, 9, 7, 5].map((day, index) => ({
    id: `past-${day}`,
    user_id: state.user.id,
    display_name: "画面テスト",
    group_id: null,
    performed_on: "2026-09-11",
    created_at: `2026-09-11T0${index}:00:00Z`,
    revision: 1,
    exercises: [{ name: `種目${day}`, sets: [{ weight: 60, reps: 10 }] }],
  }));
  await page.route("**/api/workouts/activity?*", (route) =>
    route.fulfill({
      json: {
        month: "2026-09",
        metric: "volume",
        total_volume: 2400,
        total_sets: 4,
        workout_count: 4,
        active_days: 1,
        days: [{ date: "2026-09-11", volume: 2400, set_count: 4, workout_count: 4 }],
      },
    }),
  );
  let reads = 0;
  await page.route("**/api/workouts?performed_on=2026-09-11&limit=50", (route) => {
    reads++;
    return route.fulfill({ json: records });
  });
  await expect(page.getByText("前回を振り返る", { exact: true })).toHaveCount(0);
  await navigate(page, "履歴");
  await page.locator('.personal-history-calendar button[aria-label*="9月11日"]').click();
  await expect(page.getByRole("dialog").locator(".record-review")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "種目11" })).toBeVisible();
  expect(reads).toBe(1);
});
