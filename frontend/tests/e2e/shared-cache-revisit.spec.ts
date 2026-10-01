import { expect, test } from "./fixtures";
import { mockTraining, navigate, startTraining } from "./mock-training";

test("ホームの共有本文をグループで先に表示し、最新タブ再訪で本文と通信を保持する", async ({
  page,
}) => {
  await page.clock.install();
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect.poll(() => state.saves).toBe(1);
  let reads = 0;
  let hold: Promise<void> | null = null;
  let release = () => {};
  await page.route(
    `**/api/groups/${state.group.id}/workouts/${state.session?.id}`,
    async (route) => {
      reads++;
      await hold;
      await route.fallback();
    },
  );
  await navigate(page, "ホーム");
  await expect(page.locator(".community-feed:visible .record-details")).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const homeReads = reads;
  await navigate(page, "グループ");
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.getByRole("button", { name: `${state.group.name}の詳細`, exact: true }).click();
  await expect.poll(() => reads).toBeGreaterThan(homeReads);
  const groupReads = reads;
  const groupPending = await page.locator(".community-feed:visible .is-pending").count();
  const loaded = page.waitForResponse((response) =>
    response.url().endsWith(`/workouts/${state.session?.id}`),
  );
  release();
  hold = null;
  await loaded;
  await expect(page.locator(".community-feed:visible .record-details")).toBeVisible();
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "カレンダー", exact: true })
    .click();
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "最新記録", exact: true })
    .click();
  await expect(page.locator(".community-feed:visible .record-details")).toBeVisible();
  const reopenedPending = await page.locator(".community-feed:visible .is-pending").count();
  release();
  hold = null;
  await expect(page.locator(".community-feed:visible .record-details")).toBeVisible();
  const result = { homeReads, groupReads, reopenedReads: reads, groupPending, reopenedPending };
  expect(result.groupPending).toBe(0);
  expect(result.reopenedPending).toBe(0);
  expect(result.reopenedReads).toBe(groupReads);
  await test
    .info()
    .attach("cache-audit", { body: JSON.stringify(result), contentType: "application/json" });
});

test("同じグループのカレンダー再訪は通信中も前の表示を残すか", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-28T03:00:00Z") });
  const state = await mockTraining(page);
  await page.route(`**/api/groups/${state.group.id}/analytics?*`, (route) =>
    route.fulfill({ status: 503, json: { detail: "一時的に取得できません" } }),
  );
  let reads = 0;
  let hold: Promise<void> | null = null;
  let release = () => {};
  await page.route(`**/api/groups/${state.group.id}/workouts/activity?*`, async (route) => {
    reads++;
    await hold;
    return route.fulfill({
      json: {
        month: "2026-09",
        metric: "volume",
        total_volume: 600,
        total_sets: 2,
        workout_count: 1,
        active_days: 1,
        days: [
          {
            date: "2026-09-28",
            volume: 600,
            set_count: 2,
            workout_count: 1,
            body_parts: [{ body_part: "chest", volume: 600, set_count: 2, workout_count: 1 }],
          },
        ],
      },
    });
  });
  await navigate(page, "グループ");
  await page.getByRole("button", { name: `${state.group.name}の詳細`, exact: true }).click();
  const tabs = page.getByRole("navigation", { name: "グループの表示" });
  await tabs.getByRole("button", { name: "カレンダー", exact: true }).click();
  const marked = page.locator(
    '.group-history-calendar .personal-history-days button[data-level="4"]',
  );
  await expect(marked).toHaveCount(1);
  const first = reads;
  await tabs.getByRole("button", { name: "グラフ", exact: true }).click();
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await tabs.getByRole("button", { name: "カレンダー", exact: true }).click();
    await expect.poll(() => reads).toBeGreaterThan(first);
    await expect(marked).toHaveCount(1);
    expect(reads).toBe(first + 1);
  } finally {
    release();
  }
});

test("日別全51件を再訪の通信中も保持し、追加ページを重複取得しない", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-28T03:00:00Z") });
  const state = await mockTraining(page);
  await page.route(`**/api/groups/${state.group.id}/workouts/activity?*`, (route) =>
    route.fulfill({
      json: {
        month: "2026-09",
        metric: "volume",
        total_volume: 600,
        total_sets: 51,
        workout_count: 51,
        active_days: 1,
        days: [
          {
            date: "2026-09-28",
            volume: 600,
            set_count: 51,
            workout_count: 51,
            body_parts: [{ body_part: "chest", volume: 600, set_count: 51, workout_count: 51 }],
          },
        ],
      },
    }),
  );
  const records = Array.from({ length: 51 }, (_, i) => ({
    id: `audit-${i}`,
    user_id: state.user.id,
    display_name: "画面テスト",
    performed_on: "2026-09-28",
    created_at: "2026-09-28T03:00:00Z",
    revision: 1,
    exercises: [
      { name: i === 50 ? "51件目の種目" : "ベンチプレス", sets: [{ weight: 60, reps: 10 }] },
    ],
  }));
  let extraReads = 0;
  let hold: Promise<void> | null = null;
  let release = () => {};
  await page.route(`**/api/groups/${state.group.id}/workouts?*`, async (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset") || 0);
    if (offset) {
      extraReads++;
      await hold;
    }
    return route.fulfill({ json: records.slice(offset, offset + 50) });
  });
  await navigate(page, "グループ");
  await page.getByRole("button", { name: `${state.group.name}の詳細`, exact: true }).click();
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "カレンダー", exact: true })
    .click();
  const day = page
    .locator(".group-history-calendar .personal-history-days button")
    .filter({ hasText: "28" });
  await day.click();
  await expect(page.getByRole("dialog").locator(".record-review")).toHaveCount(51);
  const first = extraReads;
  await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await day.click();
    await expect.poll(() => extraReads).toBeGreaterThan(first);
    const visibleCount = await page.getByRole("dialog").locator(".record-review").count();

    await test.info().attach("day-after", {
      body: await page.screenshot({
        path: process.env.CACHE_SCREENSHOTS_DIR
          ? `${process.env.CACHE_SCREENSHOTS_DIR}/day-after.png`
          : undefined,
      }),
      contentType: "image/png",
    });
    expect(visibleCount).toBe(51);
    expect(extraReads - first).toBe(1);
  } finally {
    release();
  }
});

test("同じグループを開き直したグラフは更新待ちでもプロットを保持する", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-28T03:00:00Z") });
  const state = await mockTraining(page);
  let reads = 0;
  let hold: Promise<void> | null = null;
  let release = () => {};
  const totals = { volume: 600, sets: 2, days: 1, people: 1, weight: 60, rm: 80 };
  await page.route(`**/api/groups/${state.group.id}/analytics?*`, async (route) => {
    reads++;
    await hold;
    return route.fulfill({
      json: {
        window: {
          period: "all",
          offset: 0,
          start: "2026-09-01",
          end: "2026-09-28",
          previous_start: null,
          previous_end: null,
          can_previous: false,
        },
        exercise: null,
        exercises: [],
        totals,
        previous_totals: null,
        series: { month: [{ ...totals, start: "2026-09-01", end: "2026-09-28" }] },
        rankings: {},
      },
    });
  });
  await navigate(page, "グループ");
  await page.getByRole("button", { name: `${state.group.name}の詳細`, exact: true }).click();
  let tabs = page.getByRole("navigation", { name: "グループの表示" });
  await tabs.getByRole("button", { name: "グラフ", exact: true }).click();
  const plot = page.locator(".group-history-graph .personal-history-plot-scroll");
  await expect(plot).toBeVisible();
  const first = reads;
  await page.getByRole("button", { name: "グループ一覧", exact: false }).click();
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await page.getByRole("button", { name: `${state.group.name}の詳細`, exact: true }).click();
    tabs = page.getByRole("navigation", { name: "グループの表示" });
    await tabs.getByRole("button", { name: "グラフ", exact: true }).click();
    await expect.poll(() => reads).toBeGreaterThan(first);
    const keptPlot = await plot.count();

    await test.info().attach("graph-after", {
      body: await page.screenshot({
        path: process.env.CACHE_SCREENSHOTS_DIR
          ? `${process.env.CACHE_SCREENSHOTS_DIR}/graph-after.png`
          : undefined,
      }),
      contentType: "image/png",
    });
    expect(keptPlot).toBe(1);
  } finally {
    release();
  }
});
