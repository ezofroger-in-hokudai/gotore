import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

for (const count of [1, 5, 100]) {
  test(`${count}グループでも起動時は選択中と隣だけを取得する`, async ({ page }) => {
    await page.clock.install();
    const state = await mockTraining(page);
    const groups = [
      state.group,
      ...Array.from({ length: count - 1 }, (_, i) => ({
        ...state.group,
        id: `group-${i}`,
        name: `部活${i}`,
      })),
    ];
    let visible = groups;
    let summaries = 0;
    const feeds: string[] = [];
    await page.route("**/api/groups", (route) => route.fulfill({ json: visible }));
    await page.route("**/api/groups/activity/summary", (route) => {
      summaries++;
      return route.fulfill({ json: [] });
    });
    await page.route("**/api/groups/*/activity", (route) => {
      const id = new URL(route.request().url()).pathname.split("/")[3];
      feeds.push(id);
      return route.fulfill({
        json: {
          group_id: id,
          member_count: 2,
          live_count: 0,
          today_count: 1,
          members: [],
          feed: [],
        },
      });
    });
    await page.reload();
    await expect(page.locator(".group-carousel .community-card")).toHaveCount(count);
    await expect
      .poll(() => feeds)
      .toEqual(count === 1 ? [state.group.id] : [state.group.id, "group-0"]);
    expect(summaries).toBe(0);
    await expect(page.locator(".community-total").filter({ hasText: "2人" })).toHaveCount(
      Math.min(count, 2),
    );
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    const before = feeds.length;
    await page.clock.runFor(15_000);
    await expect.poll(() => feeds.length).toBe(before + 1);
    expect(feeds.at(-1)).toBe(state.group.id);
    if (count > 1) {
      await page.getByRole("button", { name: "部活0を表示", exact: true }).click();
      await expect.poll(() => new Set(feeds).size).toBe(3);
      expect(new Set(feeds)).toEqual(new Set([state.group.id, "group-0", "group-1"]));
      visible = groups.slice(1);
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await expect(page.locator(".group-carousel .community-card")).toHaveCount(count - 1);
    }
    await navigate(page, "設定");
    const stopped = feeds.length;
    await page.clock.runFor(30_500);
    expect(feeds.length).toBe(stopped);
    expect(summaries).toBe(0);
  });
}
