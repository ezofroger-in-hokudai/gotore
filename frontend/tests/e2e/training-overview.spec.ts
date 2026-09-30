import { expect, test } from "./fixtures";
import { mockTraining, navigate } from "./mock-training";
import { mockHistoryCalendar, openHistoryDay } from "./personal-history-helper";

test("ホームから振り返りを外し、先読みした記録は履歴で確認できる", async ({ page }) => {
  const state = await mockTraining(page, true, false, false);
  await navigate(page, "設定");
  let reads = 0;
  let dayReads = 0;
  const records = [11, 9, 7, 5].map((day, i) => ({
    id: `past-${day}`,
    revision: 1,
    user_id: state.user.id,
    display_name: "画面テスト",
    group_id: null,
    performed_on: `2026-09-${String(day).padStart(2, "0")}`,
    created_at: "2026-09-11T12:00:00Z",
    exercises: [
      {
        name: "ベンチプレス",
        sets: [
          { weight: 60 - i * 5, reps: 10 },
          { weight: 60 - i * 5, reps: 8 },
        ],
      },
      { name: "スクワット", sets: [{ weight: 80 - i * 5, reps: 8 }] },
    ],
  }));
  await page.route("**/api/workouts?*", async (route) => {
    reads++;
    const day = new URL(route.request().url()).searchParams.get("performed_on");
    if (day) dayReads++;
    return route.fulfill({
      json: day ? records.filter((record) => record.performed_on === day) : records,
    });
  });
  await mockHistoryCalendar(page, () => records);
  await navigate(page, "ホーム");
  await expect.poll(() => reads).toBe(1);
  await expect(page.getByText("前回を振り返る", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "これまでのトレーニング" })).toHaveCount(0);
  const day = await openHistoryDay(page, records[0].performed_on);
  await expect(day.locator(".record")).toHaveCount(1);
  await expect(day.getByRole("table")).toHaveCount(2);
  await expect.poll(() => dayReads).toBe(1);
});
