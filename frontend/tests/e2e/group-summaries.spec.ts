import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("複数グループの今日の活動を一度に取得し、フィード絞り込みと権限喪失を反映する", async ({
  page,
}) => {
  const state = await mockTraining(page);
  const groups = [
    state.group,
    ...Array.from({ length: 4 }, (_, index) => ({
      ...state.group,
      id: `group-${index}`,
      name: `部活${index}`,
    })),
  ];
  let requests = 0;
  let forbidden = false;
  await page.route("**/api/groups", (route) => route.fulfill({ json: groups }));
  await page.route("**/api/groups/today-activity", (route) => {
    requests++;
    if (forbidden) return route.fulfill({ status: 403, json: { detail: "閲覧できません" } });
    return route.fulfill({
      json: {
        totals: { set_count: 5, total_volume: 4000 },
        groups: groups.map((group) => ({
          group_id: group.id,
          name: group.name,
          member_count: 2,
          live_count: 0,
          today_count: 1,
          members: [],
          totals: { set_count: 1, total_volume: 800 },
          feed: [
            {
              workout_id: `record-${group.id}`,
              user_id: "friend",
              display_name: "本人",
              exercise: `${group.name}の記録`,
              weight: 80,
              reps: 10,
              estimated_rm: 106.7,
              updated_at: new Date().toISOString(),
              best: false,
              summary: { exercise_count: 1, set_count: 1, total_volume: 800 },
            },
          ],
        })),
      },
    });
  });
  await page.reload();
  await expect(page.locator(".group-carousel .community-card")).toHaveCount(5);
  await expect(page.locator("[data-workout-id]")).toHaveCount(5);
  await expect(page.locator(".home-summary")).toContainText("4,000");
  const before = requests;
  await page.locator(".home-feed-tabs").getByRole("button", { name: "部活0", exact: true }).click();
  await expect(page.locator("[data-workout-id]")).toHaveCount(1);
  await expect(page.locator("[data-workout-id]")).toContainText("部活0の記録");
  expect(requests).toBe(before);
  forbidden = true;
  await navigate(page, "設定");
  await navigate(page, "ホーム");
  await expect(page.locator("[data-workout-id]")).toHaveCount(0);
  await expect(page.locator(".v2-app p[role='alert']")).toContainText("閲覧できません");
});
