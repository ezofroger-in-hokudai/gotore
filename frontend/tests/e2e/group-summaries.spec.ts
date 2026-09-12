import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("複数グループは概要をまとめ、選択中のフィードだけを更新する", async ({ page }) => {
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
  let summaries = 0;
  let fail = false;
  let visible = groups;
  const feeds: string[] = [];
  const summary = (id: string) => ({
    group_id: id,
    member_count: 2,
    live_count: 0,
    today_count: 1,
    members: [],
  });
  await page.route("**/api/groups", (route) => route.fulfill({ json: visible }));
  await page.route("**/api/groups/activity/summary", (route) => {
    summaries++;
    return fail
      ? route.fulfill({ status: 403, json: { detail: "状況を取得できません" } })
      : route.fulfill({ json: visible.map((group) => summary(group.id)) });
  });
  await page.route("**/api/groups/*/activity", (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3];
    feeds.push(id);
    return route.fulfill({
      json: {
        ...summary(id),
        feed: [
          {
            workout_id: id,
            user_id: state.user.id,
            display_name: "本人",
            exercise: id === state.group.id ? "最初の記録" : "切替先の記録",
            weight: 80,
            reps: 8,
            estimated_rm: 101.3,
            updated_at: new Date().toISOString(),
            best: false,
          },
        ],
      },
    });
  });
  await page.reload();
  await expect(page.getByRole("article")).toContainText("最初の記録");
  await expect(page.locator(".community-total").filter({ hasText: "2人" })).toHaveCount(5);
  expect(feeds.every((id) => id === state.group.id)).toBe(true);
  const before = { summaries, feeds: feeds.length };
  await page.clock.runFor(30_500);
  expect(summaries - before.summaries).toBe(2);
  expect(feeds.length - before.feeds).toBe(2);
  await page.getByRole("button", { name: "部活0を表示", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("切替先の記録");
  await expect(page.getByRole("article")).not.toContainText("最初の記録");
  expect(feeds.at(-1)).toBe("group-0");
  fail = true;
  await page.clock.runFor(15_000);
  await expect(
    page.getByRole("button", { name: "グループの状況を再試行", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `${state.group.name}の詳細`, exact: true }),
  ).toContainText("メンバー —人");
  fail = false;
  visible = groups.slice(1);
  await page.getByRole("button", { name: "グループの状況を再試行", exact: true }).click();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(".group-carousel .community-card")).toHaveCount(4);
  await navigate(page, "設定");
  const stopped = { summaries, feeds: feeds.length };
  await page.clock.runFor(30_500);
  expect({ summaries, feeds: feeds.length }).toEqual(stopped);
});
