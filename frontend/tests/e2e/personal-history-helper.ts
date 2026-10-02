import { type Page, expect } from "@playwright/test";
import type { Workout } from "../../src/lib/api";
import { chooseHistoryMonth } from "./history-period-helper";
import { navigate } from "./mock-training";

export async function mockHistoryCalendar(page: Page, records: () => Workout[]) {
  await page.route("**/api/history/summary", (route) => {
    const all = records();
    return route.fulfill({
      json: {
        workout_count: all.length,
        total_sets: all.reduce(
          (sum, record) =>
            sum + record.exercises.reduce((count, exercise) => count + exercise.sets.length, 0),
          0,
        ),
        total_volume: all.reduce((sum, record) => sum + volume(record), 0),
        first_performed_on: all.map((record) => record.performed_on).sort()[0] ?? null,
        exercises: [
          ...new Map(
            all.flatMap((record) =>
              record.exercises.map(
                (exercise) =>
                  [
                    exercise.name,
                    {
                      name: exercise.name,
                      body_part: "other",
                      last_performed_on: record.performed_on,
                    },
                  ] as const,
              ),
            ),
          ).values(),
        ],
      },
    });
  });
  await page.route("**/api/workouts/activity?*", (route) => {
    const month = new URL(route.request().url()).searchParams.get("month");
    const matching = records().filter((record) => record.performed_on.startsWith(month ?? ""));
    const dates = [...new Set(matching.map((record) => record.performed_on))];
    return route.fulfill({
      json: {
        month,
        metric: "volume",
        total_volume: matching.reduce((sum, record) => sum + volume(record), 0),
        active_days: dates.length,
        workout_count: matching.length,
        total_sets: matching.reduce(
          (sum, record) =>
            sum + record.exercises.reduce((count, exercise) => count + exercise.sets.length, 0),
          0,
        ),
        days: dates.map((date) => {
          const day = matching.filter((record) => record.performed_on === date);
          return {
            date,
            volume: day.reduce((sum, record) => sum + volume(record), 0),
            set_count: day.reduce(
              (sum, record) =>
                sum + record.exercises.reduce((count, exercise) => count + exercise.sets.length, 0),
              0,
            ),
            workout_count: day.length,
          };
        }),
      },
    });
  });
}

export async function openHistoryDay(page: Page, day: string) {
  await navigate(page, "履歴");
  await expect(page.locator(".personal-history-days button:enabled").first()).toBeVisible();
  await chooseHistoryMonth(page, day.slice(0, 7));
  const [year, month, date] = day.split("-").map(Number);
  await page.getByRole("button", { name: new RegExp(`^${year}年${month}月${date}日、`) }).click();
  return page.getByRole("dialog", {
    name: `${year}年${month}月${date}日の全メニュー`,
    exact: true,
  });
}

function volume(record: Workout) {
  return record.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.reduce((count, set) => count + set.weight * set.reps, 0),
    0,
  );
}
