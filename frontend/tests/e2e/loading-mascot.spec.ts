import { type Route, expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

async function openHistoryDay(
  page: import("@playwright/test").Page,
  respond: (route: Route) => Promise<unknown>,
) {
  await page.clock.setFixedTime(new Date("2026-09-13T03:00:00Z"));
  await mockTraining(page);
  await page.route("**/api/workouts?performed_on=2026-09-13*", respond);
  await page.route("**/api/workouts/activity?*", (route) =>
    route.fulfill({
      json: {
        month: "2026-09",
        metric: "volume",
        total_volume: 200,
        total_sets: 1,
        workout_count: 1,
        active_days: 1,
        days: [{ date: "2026-09-13", volume: 200, set_count: 1, workout_count: 1 }],
      },
    }),
  );
  await navigate(page, "履歴");
  await page.locator('.personal-history-calendar button[aria-label*="9月13日"]').click();
  return page.getByRole("dialog", { name: /9月13日の全メニュー/ });
}

test("日別記録の取得中は画面内だけに短い読み込み表示を出す", async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const sheet = await openHistoryDay(page, async (route) => {
      await gate;
      await route.fulfill({ json: [] });
    });
    const loading = sheet.getByRole("status", { name: "記録を読み込み中" });
    await expect(loading).toBeVisible();
    await expect(loading.locator("svg")).toHaveCount(0);
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    release();
    await expect(loading).toHaveCount(0);
    await expect(sheet.getByText("この日の記録はありません")).toBeVisible();
  } finally {
    release();
  }
});

test("日別記録の取得失敗と再試行を分け、画面内ではキャラクターを出さない", async ({ page }) => {
  let fail = true;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const sheet = await openHistoryDay(page, async (route) => {
      if (fail)
        return route.fulfill({ status: 503, json: { detail: "記録を取得できませんでした" } });
      await gate;
      return route.fulfill({ json: [] });
    });
    await expect(sheet.getByRole("alert")).toBeVisible();
    fail = false;
    await sheet.getByRole("button", { name: "再試行", exact: true }).click();
    const loading = sheet.getByRole("status", { name: "記録を読み込み中" });
    await expect(loading).toBeVisible();
    await expect(loading.locator("svg")).toHaveCount(0);
    release();
    await expect(sheet.getByText("この日の記録はありません")).toBeVisible();
    await expect(sheet.getByRole("alert")).toHaveCount(0);
  } finally {
    release();
  }
});

test("ホーム準備後は共有詳細の取得中も移動や閉じる操作を妨げない", async ({ page }) => {
  const state = await mockTraining(page);
  let showFeed = () => {};
  let showRecord = () => {};
  const feedGate = new Promise<void>((resolve) => {
    showFeed = resolve;
  });
  const recordGate = new Promise<void>((resolve) => {
    showRecord = resolve;
  });
  const record = {
    id: "loading-friend",
    user_id: "friend",
    display_name: "友達A",
    group_id: state.group.id,
    performed_on: "2026-09-01",
    created_at: "2026-09-01T01:00:00Z",
    revision: 1,
    exercises: [{ name: "ベンチプレス", sets: [{ weight: 20, reps: 10 }] }],
  };
  await page.route("**/api/groups/today-activity", async (route) => {
    await feedGate;
    await route.fulfill({
      json: {
        totals: { set_count: 1, total_volume: 200 },
        groups: [
          {
            group_id: state.group.id,
            name: state.group.name,
            member_count: 1,
            live_count: 0,
            today_count: 1,
            members: [],
            totals: { set_count: 1, total_volume: 200 },
            feed: [
              {
                workout_id: record.id,
                user_id: record.user_id,
                display_name: record.display_name,
                exercise: "ベンチプレス",
                weight: 20,
                reps: 10,
                estimated_rm: null,
                updated_at: record.created_at,
                best: false,
                summary: { exercise_count: 1, set_count: 1, total_volume: 200 },
              },
            ],
          },
        ],
      },
    });
  });
  await page.route(`**/api/groups/${state.group.id}/workouts/${record.id}`, async (route) => {
    await recordGate;
    await route.fulfill({ json: record });
  });
  try {
    await page.reload();
    const homeLoading = page.getByRole("status", { name: "アプリを読み込み中" });
    await expect(homeLoading.locator("svg")).toBeVisible();
    showFeed();
    await expect(homeLoading).toHaveCount(0);
    await navigate(page, "設定");
    await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
    await navigate(page, "ホーム");
    showFeed();
    await expect(homeLoading).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "記録の日付を確認中" })).toBeVisible();
    await expect(page.getByRole("button", { name: "設定", exact: true })).toBeVisible();
    showRecord();
    const card = page.getByRole("article").filter({ hasText: "友達A" });
    await expect(card.locator(".record-set")).toHaveCount(1);
  } finally {
    showFeed();
    showRecord();
  }
});

test("アプリ準備中だけ筋トレ表示し、動き低減では静止する", async ({ page }) => {
  await mockTraining(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/sessions/active", async (route) => {
    await gate;
    await route.fulfill({ json: null });
  });
  try {
    await page.reload({ waitUntil: "commit" });
    const loading = page.getByRole("status", { name: "アプリを読み込み中" });
    await expect(loading.locator("svg")).toBeVisible();
    await expect
      .poll(() =>
        loading.locator("svg").evaluate((svg) => svg.getAnimations({ subtree: true }).length),
      )
      .toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(() =>
        loading.locator("svg").evaluate((svg) => svg.getAnimations({ subtree: true }).length),
      )
      .toBe(0);
    await page.screenshot({
      path: "test-results/loading-startup-390.png",
      fullPage: true,
    });
    release();
    await expect(
      page.getByRole("button", { name: "トレーニングを開始", exact: true }),
    ).toBeVisible();
    await expect(loading).toHaveCount(0);
  } finally {
    release();
  }
});
