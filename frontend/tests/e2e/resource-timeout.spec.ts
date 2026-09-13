import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("応答が止まった履歴は15秒で再試行でき、古い応答で上書きしない", async ({ page }) => {
  await page.clock.install();
  const state = await mockTraining(page);
  const record = {
    id: "record",
    user_id: state.user.id,
    display_name: "本人",
    group_id: null,
    performed_on: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    revision: 1,
    exercises: [{ name: "保存済み", sets: [{ weight: 20, reps: 10 }] }],
  };
  let hold = false;
  let reads = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workouts?**", async (route) => {
    reads++;
    const blocked = hold;
    if (blocked) await gate;
    return route.fulfill({
      json: [
        {
          ...record,
          exercises: [{ ...record.exercises[0], name: blocked ? "古い応答" : "保存済み" }],
        },
      ],
    });
  });
  await navigate(page, "履歴");
  await expect(page.locator(".history-row")).toContainText("保存済み");
  await navigate(page, "ホーム");
  hold = true;
  await navigate(page, "履歴");
  await expect.poll(() => reads).toBe(2);
  await expect(page.locator(".history-row")).toContainText("保存済み");
  try {
    await page.clock.runFor(15_001);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "更新できませんでした。前回の内容を表示しています。" }),
    ).toBeVisible();
    await expect(page.locator(".history-row")).toContainText("保存済み");
    hold = false;
    await page.getByRole("button", { name: "再試行", exact: true }).click();
    await expect(page.locator(".history-row")).toContainText("保存済み");
    release();
    await page.waitForTimeout(150);
    await expect(page.locator(".history-row")).not.toContainText("古い応答");
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
  await page.route(`**/api/groups/${state.group.id}/activity`, async (route) => {
    reads++;
    if (hold) await gate;
    return route.fulfill({
      json: {
        group_id: state.group.id,
        member_count: 1,
        live_count: 0,
        today_count: 1,
        members: [],
        feed: [],
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
    await expect(page.locator(".community-total").first()).toContainText("1人");
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.clock.runFor(1000);
    await expect.poll(() => reads).toBe(first + 1);
    await page.clock.runFor(15_001);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "更新できませんでした。前回の内容を表示しています。" }),
    ).toBeVisible();
    expect(reads).toBe(first + 1);
    hold = false;
    await page.clock.runFor(5000);
    await expect(page.locator(".community-total").first()).toContainText("1人");
    expect(reads).toBe(first + 2);
    await navigate(page, "設定");
    await page.clock.runFor(20_000);
    expect(reads).toBe(first + 2);
  } finally {
    release();
  }
});
