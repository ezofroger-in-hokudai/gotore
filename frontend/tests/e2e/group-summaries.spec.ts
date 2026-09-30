import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("複数グループの活動を一度に取得し、絞り込みは通信なし、非表示では更新を止める", async ({
  page,
}) => {
  await page.clock.install();
  const state = await mockTraining(page);
  const groups = [
    state.group,
    ...Array.from({ length: 4 }, (_, i) => ({
      ...state.group,
      id: `group-${i}`,
      name: `部活${i}`,
    })),
  ];
  let reads = 0;
  let forbidden = false;
  let visible = groups;
  await page.route("**/api/groups", (route) => route.fulfill({ json: visible }));
  await page.route("**/api/groups/today-activity", (route) => {
    reads++;
    return route.fulfill(
      forbidden
        ? { status: 403, json: { detail: "状況を取得できません" } }
        : {
            json: {
              groups: visible.map((group) => ({
                group_id: group.id,
                name: group.name,
                member_count: 2,
                live_count: 0,
                today_count: 1,
                members: [],
                totals: { set_count: 1, total_volume: 640 },
                feed: [
                  {
                    workout_id: group.id,
                    user_id: state.user.id,
                    display_name: "本人",
                    exercise: group.id === state.group.id ? "最初の記録" : `${group.name}の記録`,
                    weight: 80,
                    reps: 8,
                    estimated_rm: 101.3,
                    updated_at: new Date().toISOString(),
                    best: false,
                  },
                ],
              })),
              totals: { set_count: visible.length, total_volume: visible.length * 640 },
            },
          },
    );
  });
  await page.reload();
  await expect(page.locator(".community-feed [data-workout-id]")).toHaveCount(5);
  await expect(page.locator(".group-carousel .community-card")).toHaveCount(5);
  const before = reads;
  await page.clock.runFor(30_500);
  expect(reads - before).toBe(2);
  const beforeFilter = reads;
  await page.locator(".home-feed-tabs").getByRole("button", { name: "部活0", exact: true }).click();
  await expect(page.locator(".community-feed [data-workout-id]")).toHaveCount(1);
  await expect(page.locator(".community-feed")).toContainText("部活0の記録");
  expect(reads).toBe(beforeFilter);
  forbidden = true;
  await page.clock.runFor(15_000);
  await expect(page.locator(".community-feed [data-workout-id]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "今日の活動を再試行", exact: true })).toBeVisible();
  forbidden = false;
  visible = groups.slice(1);
  await page.getByRole("button", { name: "今日の活動を再試行", exact: true }).click();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(".group-carousel .community-card")).toHaveCount(4);
  await expect(page.locator(".community-feed")).toContainText("部活0の記録");
  await navigate(page, "設定");
  const stopped = reads;
  await page.clock.runFor(65_000);
  expect(reads).toBe(stopped);
});
