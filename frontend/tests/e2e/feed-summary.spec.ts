import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`${width}px: 詳細が失敗しても共有要約を表示し、保存後更新と権限喪失を反映する`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.install();
    const state = await mockTraining(page);
    await navigate(page, "設定");
    let forbidden = false;
    let count = 9;
    let legacy = false;
    let detailReads = 0;
    await page.route(`**/api/groups/${state.group.id}/workouts/*`, (route) => {
      detailReads++;
      return route.fulfill({ status: 503, json: { detail: "一時的に取得できません。" } });
    });
    await page.route(`**/api/groups/${state.group.id}/activity`, (route) =>
      forbidden
        ? route.fulfill({ status: 403, json: { detail: "グループを閲覧できません。" } })
        : route.fulfill({
            json: {
              group_id: state.group.id,
              observed_at: new Date().toISOString(),
              member_count: 2,
              live_count: 1,
              today_count: 1,
              members: [
                {
                  id: "friend",
                  display_name: "トレーニング仲間",
                  live: true,
                  today: true,
                  live_until: new Date(Date.now() + 600000).toISOString(),
                },
              ],
              feed: [
                {
                  workout_id: "friend-record",
                  user_id: "friend",
                  display_name: "トレーニング仲間",
                  exercise: "ダンベルインクラインベンチプレス（ゆっくり下ろす）",
                  weight: 25,
                  reps: 10,
                  estimated_rm: 33.3,
                  best: false,
                  updated_at: new Date().toISOString(),
                  ...(legacy ? {} : { summary: { exercise_count: 3, set_count: count } }),
                },
              ],
            },
          }),
    );
    await navigate(page, "ホーム");
    const card = page.locator('[data-workout-id="friend-record"]');
    await expect(card.locator(".feed-summary")).toHaveText("3種目 · 9セット");
    await expect.poll(() => detailReads).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    count = 10;
    await page.clock.runFor(5000);
    await expect(card.locator(".feed-summary")).toHaveText("3種目 · 10セット");
    legacy = true;
    await page.clock.runFor(5000);
    await expect(card.locator(".feed-summary")).toHaveCount(0);
    await expect(card).toContainText("25");
    forbidden = true;
    await page.clock.runFor(5000);
    await expect(card).toHaveCount(0);
    expect(state.session).toBeNull();
    expect(state.saves).toBe(0);
  });
}
