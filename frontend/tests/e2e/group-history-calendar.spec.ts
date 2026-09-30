import { expect, test } from "./fixtures";
import { mockTraining, openGroup } from "./mock-training";

test("グループの月間カレンダーと日別記録は個人履歴と同じ表示・操作を使う", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
  const state = await mockTraining(page);
  const activityRequests: string[] = [];
  await page.route(`**/api/groups/${state.group.id}/workouts/activity?*`, (route) => {
    const month = new URL(route.request().url()).searchParams.get("month") ?? "";
    activityRequests.push(month);
    return route.fulfill({
      json: {
        month,
        metric: "volume",
        total_volume: 1450,
        total_sets: 8,
        workout_count: 4,
        active_days: 4,
        days: [
          { date: "2026-09-05", volume: 100 },
          { date: "2026-09-09", volume: 300 },
          { date: "2026-09-13", volume: 450 },
          { date: "2026-09-28", volume: 600 },
        ].map(({ date, volume }) => ({
          date,
          volume,
          set_count: 2,
          workout_count: 1,
          body_parts: [{ body_part: "chest", volume, set_count: 2, workout_count: 1 }],
        })),
      },
    });
  });
  await page.route(`**/api/groups/${state.group.id}/workouts?*`, (route) =>
    route.fulfill({
      json: [
        {
          id: "group-history-day",
          user_id: state.user.id,
          display_name: "画面テスト",
          performed_on: "2026-09-28",
          created_at: "2026-09-28T03:00:00Z",
          revision: 1,
          exercises: [{ name: "ベンチプレス", sets: [{ weight: 60, reps: 10 }] }],
        },
      ],
    }),
  );
  await openGroup(page);
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "カレンダー" })
    .click();
  const calendar = page.locator(".group-history-calendar .personal-history-calendar");
  await expect(calendar).toBeVisible();
  await expect(calendar.locator(".personal-history-days > *")).toHaveCount(42);
  await expect(calendar.locator(".personal-history-days button[data-level='4']")).toHaveCount(1);
  const heatColors = await calendar
    .locator(".personal-history-days button[data-level]:not([data-level='0'])")
    .evaluateAll((days) => days.map((day) => getComputedStyle(day).backgroundColor));
  expect(new Set(heatColors).size).toBe(4);
  await page
    .locator(".group-history-calendar .personal-history-part-tabs")
    .getByRole("button", { name: "胸" })
    .click();
  await expect(calendar.locator(".personal-history-calendar-foot")).toContainText("胸");
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "グラフ" })
    .click();
  await expect(
    page
      .locator(".group-history-graph .personal-history-part-tabs")
      .getByRole("button", { name: "胸" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "カレンダー" })
    .click();
  await calendar.locator(".personal-history-days button").filter({ hasText: "28" }).click();
  await expect(page.getByRole("dialog", { name: "2026年9月28日の全メニュー" })).toBeVisible();
  await expect(page.getByRole("dialog").locator(".record.is-compact")).toContainText(
    "ベンチプレス",
  );
  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
  await calendar.dispatchEvent("pointerdown", { clientX: 160, clientY: 400 });
  await calendar.dispatchEvent("pointerup", { clientX: 260, clientY: 401 });
  await expect.poll(() => activityRequests.includes("2026-08")).toBe(true);
});
