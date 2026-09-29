import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("別グループの仲間の記録を表示したまま、画面の戻りと進みで選択を保持する", async ({ page }) => {
  const state = await mockTraining(page);
  const second = { ...state.group, id: "second", name: "大学トレ部" };
  const record = {
    id: "friend-record",
    user_id: "friend",
    display_name: "友達A",
    group_id: second.id,
    performed_on: "2026-09-11",
    created_at: "2026-09-11T00:00:00Z",
    revision: 1,
    exercises: [{ name: "スクワット", sets: [{ weight: 100, reps: 5 }] }],
  };
  await page.route("**/api/groups", (route) => route.fulfill({ json: [state.group, second] }));
  await page.route("**/api/groups/today-activity", (route) =>
    route.fulfill({
      json: {
        totals: { set_count: 1, total_volume: 500 },
        groups: [state.group, second].map((group) => ({
          group_id: group.id,
          name: group.name,
          member_count: 2,
          live_count: 0,
          today_count: group.id === second.id ? 1 : 0,
          members: [],
          totals: {
            set_count: group.id === second.id ? 1 : 0,
            total_volume: group.id === second.id ? 500 : 0,
          },
          feed:
            group.id === second.id
              ? [
                  {
                    workout_id: record.id,
                    user_id: record.user_id,
                    display_name: record.display_name,
                    exercise: "スクワット",
                    weight: 100,
                    reps: 5,
                    estimated_rm: 116.7,
                    updated_at: record.created_at,
                    best: false,
                    summary: { exercise_count: 1, set_count: 1, total_volume: 500 },
                  },
                ]
              : [],
        })),
      },
    }),
  );
  await page.route("**/api/groups/second/workouts/friend-record", (route) =>
    route.fulfill({ json: record }),
  );
  await page.reload();
  const selected = page.getByRole("button", { name: "大学トレ部", exact: true });
  await selected.click();
  const feed = page.locator(".community-feed:visible");
  await expect(feed).toContainText("友達A");
  await expect(feed).toContainText("スクワット");
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await navigate(page, "設定");
  await page.goBack();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await expect(feed).toContainText("友達A");
  await page.goForward();
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
  await navigate(page, "ホーム");
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await expect(feed).toContainText("友達A");
});
