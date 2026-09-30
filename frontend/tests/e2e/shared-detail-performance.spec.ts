import type { GroupActivity, Workout } from "../../src/lib/api";
import { type Page, expect, test } from "./fixtures";
import { emptyTodayActivity, mockTraining, navigate } from "./mock-training";
import { mockHistoryCalendar, openHistoryDay } from "./personal-history-helper";

function fixture(id: string, groupId: string): Workout {
  return {
    id,
    user_id: `user-${id}`,
    display_name: `友達${id}`,
    group_id: groupId,
    revision: 1,
    performed_on: "2026-09-11",
    created_at: "2026-09-11T00:00:00Z",
    exercises: [{ name: "ベンチプレス", sets: [{ weight: 80, reps: 8 }] }],
  };
}
function feedItem(record: Workout): GroupActivity["feed"][number] {
  return {
    workout_id: record.id,
    user_id: record.user_id,
    display_name: record.display_name,
    exercise: "ベンチプレス",
    weight: 80,
    reps: 8,
    estimated_rm: 101.3,
    updated_at: record.created_at,
    best: false,
  };
}
async function homeActivity(
  page: Page,
  group: { id: string; name: string },
  content: () => Partial<GroupActivity>,
) {
  await page.route("**/api/groups/today-activity", (route) => {
    const activity = emptyTodayActivity([group]);
    Object.assign(activity.groups[0], content());
    return route.fulfill({ json: activity });
  });
}

test("表示中の詳細をLIVE優先で準備し、終了済みは再取得を重ねず表示する", async ({ page }) => {
  await page.clock.install();
  const state = await mockTraining(page);
  const ended = fixture("ended", state.group.id);
  const live = fixture("live", state.group.id);
  let version = 0;
  const requests: string[] = [];
  await homeActivity(page, state.group, () => ({
    live_count: 1,
    today_count: 2,
    members: [
      {
        id: live.user_id,
        display_name: live.display_name,
        live: true,
        today: true,
        live_until: new Date(Date.now() + 120000).toISOString(),
      },
    ],
    feed: [
      feedItem(ended),
      {
        ...feedItem(live),
        updated_at: new Date(Date.parse(live.created_at) + version * 1000).toISOString(),
      },
    ],
  }));
  await page.route(`**/api/groups/${state.group.id}/workouts/*`, (route) => {
    const id = route.request().url().split("/").at(-1) ?? "";
    requests.push(id);
    return route.fulfill({ json: id === live.id ? live : ended });
  });
  await page.reload();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[0]).toBe(live.id);
  await expect(page.locator(".community-feed .record-set")).toHaveCount(2);
  await page.clock.runFor(10000);
  expect(requests.filter((id) => id === ended.id)).toHaveLength(1);
  version++;
  await page.clock.runFor(5000);
  await expect.poll(() => requests.filter((id) => id === live.id).length).toBeGreaterThan(1);
  expect(requests.filter((id) => id === ended.id)).toHaveLength(1);
  await navigate(page, "設定");
  const stopped = requests.length;
  await page.clock.runFor(10000);
  expect(requests).toHaveLength(stopped);
});

test("履歴の再確認待ちでも取得済みカレンダーと日別記録を保持する", async ({ page }) => {
  const state = await mockTraining(page, true, false, false);
  const record = { ...fixture("history", state.group.id), user_id: state.user.id, group_id: null };
  await mockHistoryCalendar(page, () => [record]);
  let hold = false;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workouts?*", async (route) => {
    if (hold) await gate;
    return route.fulfill({ json: [record] });
  });
  await page.route("**/api/workouts/activity?*", async (route) => {
    if (hold) await gate;
    return route.fallback();
  });
  const detail = await openHistoryDay(page, record.performed_on);
  await expect(detail.locator(".record-set")).toHaveCount(1);
  await detail.getByRole("button", { name: "閉じる", exact: true }).click();
  await navigate(page, "ホーム");
  hold = true;
  try {
    await navigate(page, "履歴");
    await expect(page.locator(".personal-history-calendar-foot")).toContainText("640kg");
    await openHistoryDay(page, record.performed_on);
    await expect(detail.locator(".record-set")).toHaveCount(1);
  } finally {
    release();
  }
});

test("復元確認中は起動表示で待ち、確認後にSTARTを有効にする", async ({ page }) => {
  await mockTraining(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/sessions/active", async (route) => {
    await gate;
    return route.fulfill({ json: null });
  });
  await page.reload();
  try {
    await expect(page.getByRole("status", { name: "アプリを読み込み中" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "メインナビゲーション", exact: true }),
    ).toBeHidden();
    await expect(page.getByTestId("floating-training")).toBeDisabled();
    release();
    await expect(
      page.getByRole("navigation", { name: "メインナビゲーション", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("status", { name: "アプリを読み込み中" })).toHaveCount(0);
    await expect(page.getByTestId("floating-training")).toBeEnabled();
  } finally {
    release();
  }
});

for (const target of [0, 2]) {
  test(`共有本文は同時2件までで、${target ? "スクロール先の記録も順次取得する" : "取得中の記録を重複取得しない"}`, async ({
    page,
  }) => {
    const state = await mockTraining(page);
    const records = Array.from({ length: 12 }, (_, index) =>
      fixture(`record-${index}`, state.group.id),
    );
    await homeActivity(page, state.group, () => ({ feed: records.map(feedItem) }));
    const requests: string[] = [];
    let pending = 0;
    let maximum = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/groups/${state.group.id}/workouts/*`, async (route) => {
      const id = route.request().url().split("/").at(-1) ?? "";
      requests.push(id);
      maximum = Math.max(maximum, ++pending);
      await gate;
      pending--;
      return route.fulfill({ json: records.find((record) => record.id === id) });
    });
    await page.reload();
    try {
      await expect.poll(() => requests.length).toBe(2);
      const card = page.locator(`[data-workout-id="record-${target}"]`);
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator(".record-pending-set").first()).toBeVisible();
      expect(requests).toHaveLength(2);
      release();
      await expect(card.locator(".record-set")).toHaveCount(1);
      expect(maximum).toBeLessThanOrEqual(2);
      expect(requests.filter((id) => id === `record-${target}`)).toHaveLength(1);
      expect(requests).not.toContain("record-11");
    } finally {
      release();
    }
  });
}

test("共有記録がフィードから外れたら隠し、再登場時の共有解除も反映する", async ({ page }) => {
  await page.clock.install();
  const state = await mockTraining(page);
  const record = fixture("revoked", state.group.id);
  let listed = true;
  let revoked = false;
  await homeActivity(page, state.group, () => ({ feed: listed ? [feedItem(record)] : [] }));
  await page.route(`**/api/groups/${state.group.id}/workouts/${record.id}`, (route) =>
    revoked
      ? route.fulfill({ status: 404, json: { detail: "記録を閲覧できません" } })
      : route.fulfill({ json: record }),
  );
  await page.reload();
  const card = page.locator(`[data-workout-id="${record.id}"]`);
  await expect(card.locator(".record-set")).toHaveCount(1);
  listed = false;
  await page.clock.runFor(15000);
  await expect(card).toHaveCount(0);
  revoked = true;
  listed = true;
  await page.clock.runFor(15000);
  await expect(card.getByRole("alert")).toContainText("記録の詳細を取得できませんでした");
  await expect(card.locator(".record-set")).toHaveCount(0);
  revoked = false;
  await card.getByRole("button", { name: "記録の詳細を再試行", exact: true }).click();
  await expect(card.locator(".record-set")).toHaveCount(1);
});
