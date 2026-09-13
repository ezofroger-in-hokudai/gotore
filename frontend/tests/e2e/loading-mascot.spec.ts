import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("初回は筋トレ表示、取得後は即表示し、再確認でカレンダーを隠さない", async ({ page }) => {
  await mockTraining(page);
  let release = () => {};
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route("**/api/workouts/activity?*", async (route) => {
    reads++;
    await gate;
    await route.fulfill({
      json: {
        month: new URL(route.request().url()).searchParams.get("month"),
        metric: "volume",
        total_volume: 0,
        total_sets: 0,
        workout_count: 0,
        active_days: 0,
        days: [],
      },
    });
  });
  await page.reload();
  await navigate(page, "履歴");
  const calendar = page.getByRole("region", { name: "活動カレンダー", exact: true });
  const loading = calendar.getByRole("status", { name: "活動カレンダーを読み込み中" });
  try {
    await expect(loading.locator("svg")).toBeVisible();
    await expect(calendar.locator(".activity-totals")).toContainText("—");
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: `test-results/loading-calendar-${width}.png`, fullPage: true });
    }
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.screenshot({ path: "test-results/loading-calendar-dark.png", fullPage: true });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    const motion = loading
      .locator("svg")
      .evaluate((svg) =>
        svg.getAnimations({ subtree: true }).some((animation) => animation.playState === "running"),
      );
    expect(await motion).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await loading.locator("svg").evaluate((svg) => svg.getAnimations({ subtree: true }).length),
    ).toBe(0);
    release();
    await expect(loading).toHaveCount(0);
    await expect(calendar.locator(".activity-totals")).toContainText("0");
    await navigate(page, "ホーム");
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = reads;
    await navigate(page, "履歴");
    await expect.poll(() => reads).toBeGreaterThan(previous);
    await expect(calendar.getByText("更新中…", { exact: true })).toBeVisible();
    await expect(loading).toHaveCount(0);
    await expect(calendar.locator(".activity-totals")).toContainText("0");
  } finally {
    release();
  }
});

test("取得失敗でキャラクターを止め、再試行中だけ再表示する", async ({ page }) => {
  await mockTraining(page);
  let fail = true;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workouts/activity?*", async (route) => {
    if (!fail) await gate;
    await route.fulfill({ status: 503, json: { detail: "記録を取得できませんでした" } });
  });
  await page.reload();
  await navigate(page, "履歴");
  const calendar = page.getByRole("region", { name: "活動カレンダー", exact: true });
  const loading = calendar.getByRole("status", { name: "活動カレンダーを読み込み中" });
  await expect(calendar.getByRole("alert")).toBeVisible();
  await expect(loading).toHaveCount(0);
  fail = false;
  try {
    await calendar.getByRole("button", { name: "再試行", exact: true }).click();
    await expect(loading.locator("svg")).toBeVisible();
    await expect(calendar.getByRole("alert")).toHaveCount(0);
    release();
    await expect(calendar.getByRole("alert")).toBeVisible();
    await expect(loading).toHaveCount(0);
  } finally {
    release();
  }
});

test("ホームと共有詳細の取得中も移動や閉じる操作を妨げない", async ({ page }) => {
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
  await page.route(`**/api/groups/${state.group.id}/activity`, async (route) => {
    await feedGate;
    await route.fulfill({
      json: {
        group_id: state.group.id,
        member_count: 1,
        live_count: 0,
        today_count: 0,
        members: [],
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
    const homeLoading = page.getByRole("status", { name: "グループの記録を読み込み中" });
    await expect(homeLoading).toBeVisible();
    await page.screenshot({ path: "test-results/loading-home-390.png", fullPage: true });
    await navigate(page, "設定");
    await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
    await navigate(page, "ホーム");
    showFeed();
    await expect(homeLoading).toHaveCount(0);
    const open = page.getByRole("button", { name: "友達Aの記録詳細を開く", exact: true });
    await open.click();
    const dialog = page.getByRole("dialog", { name: "記録の詳細", exact: true });
    const loading = dialog.getByRole("status", { name: "記録の詳細を読み込み中" });
    await expect(loading).toBeVisible();
    await page.screenshot({ path: "test-results/loading-shared-390.png", fullPage: true });
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    showRecord();
    await open.click();
    await expect(dialog.locator(".record-set")).toHaveCount(1);
    await expect(loading).toHaveCount(0);
  } finally {
    showFeed();
    showRecord();
  }
});
