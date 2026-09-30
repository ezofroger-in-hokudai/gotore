import { expect, test } from "@playwright/test";
import { mockTraining } from "./mock-training";

test("50件のフィード上限を超えても今日とグループの集計は全件を示す", async ({ page }) => {
  const state = await mockTraining(page);
  const feed = Array.from({ length: 50 }, (_, index) => ({
    workout_id: `workout-${index}`,
    user_id: "friend",
    display_name: "仲間",
    exercise: "ベンチプレス",
    weight: 80,
    reps: 8,
    estimated_rm: 101.3,
    updated_at: new Date(Date.now() - index * 1000).toISOString(),
    best: false,
    summary: { exercise_count: 1, set_count: 1, total_volume: 640 },
  }));
  const totals = { set_count: 51, total_volume: 32640 };
  let includeTotals = true;
  await page.route("**/api/groups/today-activity", (route) =>
    route.fulfill({
      json: {
        ...(includeTotals ? { totals } : {}),
        groups: [
          {
            group_id: state.group.id,
            name: state.group.name,
            member_count: 2,
            live_count: 0,
            today_count: 1,
            members: [],
            feed,
            ...(includeTotals ? { totals } : {}),
          },
        ],
      },
    }),
  );
  await page.reload();
  await expect(page.getByRole("region", { name: "今日の活動" })).toContainText("51セット");
  await expect(page.getByRole("region", { name: "今日の活動" })).toContainText("32,640kg");
  const card = page.locator(`.group-carousel [data-group-id="${state.group.id}"]`);
  await expect(card).toContainText("51セット");
  await expect(card).toContainText("32,640kg");
  expect(feed).toHaveLength(50);
  includeTotals = false;
  await page.reload();
  await expect(page.getByRole("region", { name: "今日の活動" })).toContainText("—セット");
  await expect(card).toContainText("—セット");
});
