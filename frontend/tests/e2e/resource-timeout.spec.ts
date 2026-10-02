import { expect, test } from "./fixtures";
import { emptyTodayActivity, mockTraining, navigate } from "./mock-training";
import { mockHistoryCalendar, openHistoryDay } from "./personal-history-helper";

test("応答が止まった履歴は15秒で再試行でき、古い応答で上書きしない", async ({ page }) => {
  await page.clock.install();
  const state = await mockTraining(page, true, false, false);
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
  await mockHistoryCalendar(page, () => [record]);
  let hold = false;
  let reads = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workouts?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("performed_on") !== record.performed_on)
      return route.fallback();
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
  const detail = await openHistoryDay(page, record.performed_on);
  await expect(detail.locator(".record")).toContainText("保存済み");
  await detail.getByRole("button", { name: "閉じる", exact: true }).click();
  hold = true;
  await openHistoryDay(page, record.performed_on);
  await expect.poll(() => reads).toBe(2);
  await expect(detail.locator(".record")).toContainText("保存済み");
  try {
    await page.clock.runFor(15_001);
    await expect(
      detail
        .getByRole("alert")
        .filter({ hasText: "更新できませんでした。前回の内容を表示しています。" }),
    ).toBeVisible();
    await expect(detail.locator(".record")).toContainText("保存済み");
    hold = false;
    await detail.getByRole("button", { name: "再試行", exact: true }).click();
    await expect(detail.locator(".record")).toContainText("保存済み");
    release();
    await page.waitForTimeout(150);
    await expect(detail.locator(".record")).not.toContainText("古い応答");
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
    const activity = emptyTodayActivity([state.group]);
    activity.groups[0].today_count = 1;
    return route.fulfill({ json: activity });
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
        .locator(".v2-app")
        .getByRole("alert")
        .filter({ hasText: "更新できませんでした。前回の内容を表示しています。" }),
    ).toHaveCount(0);
    release();
    await expect(page.locator(".group-carousel .community-card")).toContainText("1人");
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.clock.runFor(15_000);
    await expect.poll(() => reads).toBe(first + 1);
    await page.clock.runFor(15_001);
    await expect(
      page
        .locator(".v2-app")
        .getByRole("alert")
        .filter({ hasText: "更新できませんでした。前回の内容を表示しています。" }),
    ).toBeVisible();
    expect(reads).toBe(first + 1);
    hold = false;
    await page.clock.runFor(15_000);
    await expect(page.locator(".group-carousel .community-card")).toContainText("1人");
    await expect.poll(() => reads).toBe(first + 2);
    await navigate(page, "設定");
    await page.clock.runFor(20_000);
    expect(reads).toBe(first + 2);
  } finally {
    release();
  }
});
