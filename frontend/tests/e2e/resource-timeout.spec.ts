import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("応答が止まった履歴は15秒で再試行でき、古い応答で上書きしない", async ({ page }) => {
  await page.clock.install();
  await page.clock.setFixedTime(new Date("2026-09-13T03:00:00Z"));
  await mockTraining(page);
  let hold = false;
  let reads = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workouts/activity?**", async (route) => {
    reads++;
    const blocked = hold;
    if (blocked) await gate;
    const month = new URL(route.request().url()).searchParams.get("month");
    return route.fulfill({
      json: {
        month,
        metric: "volume",
        total_volume: blocked ? 100 : 600,
        total_sets: 1,
        workout_count: 1,
        active_days: 1,
        days: [{ date: "2026-09-13", volume: blocked ? 100 : 600, set_count: 1, workout_count: 1 }],
      },
    });
  });
  const calendar = page.locator(".personal-history-calendar");
  const day = calendar.locator('button[aria-label*="9月13日"]');
  await navigate(page, "履歴");
  await expect(day).toHaveAttribute("aria-label", /600kg/);
  await navigate(page, "ホーム");
  hold = true;
  await navigate(page, "履歴");
  await expect.poll(() => reads).toBe(2);
  await expect(day).toHaveAttribute("aria-label", /600kg/);
  try {
    await page.clock.runFor(15_001);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "更新できませんでした。前回の内容を表示しています。" }),
    ).toBeVisible();
    await expect(day).toHaveAttribute("aria-label", /600kg/);
    hold = false;
    await page.getByRole("button", { name: "再試行", exact: true }).click();
    await expect(day).toHaveAttribute("aria-label", /600kg/);
    release();
    await page.waitForTimeout(150);
    await expect(day).toHaveAttribute("aria-label", /600kg/);
  } finally {
    release();
  }
});

test("活動取得は遅い正常応答を待ち、期限切れ後も多重取得せず次の周期で復帰する", async ({
  page,
}) => {
  await page.clock.install();
  const state = await mockTraining(page);
  let reads = 0;
  let hold = true;
  let release = () => {};
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/groups/today-activity", async (route) => {
    reads++;
    if (hold) await gate;
    return route.fulfill({
      json: {
        totals: { set_count: 1, total_volume: 600 },
        groups: [
          {
            group_id: state.group.id,
            name: state.group.name,
            member_count: 1,
            live_count: 0,
            today_count: 1,
            members: [{ id: state.user.id, display_name: "本人", live: false, today: true }],
            feed: [],
            totals: { set_count: 1, total_volume: 600 },
          },
        ],
      },
    });
  });
  await navigate(page, "設定");
  await navigate(page, "ホーム");
  await expect.poll(() => reads).toBeGreaterThan(0);
  const first = reads;
  try {
    await page.clock.runFor(14_000);
    expect(reads).toBe(first);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "更新できませんでした。前回の内容を表示しています。" }),
    ).toHaveCount(0);
    release();
    await expect(page.getByRole("region", { name: "今日の活動" })).toContainText("1人");
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.clock.runFor(15_000);
    await expect.poll(() => reads).toBe(first + 1);
    await page.clock.runFor(15_001);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "更新できませんでした。前回の内容を表示しています。" }),
    ).toBeVisible();
    expect(reads).toBe(first + 1);
    hold = false;
    await page.clock.runFor(15_000);
    await expect(page.getByRole("region", { name: "今日の活動" })).toContainText("1人");
    expect(reads).toBe(first + 2);
    await navigate(page, "設定");
    await page.clock.runFor(20_000);
    expect(reads).toBe(first + 2);
  } finally {
    release();
  }
});
