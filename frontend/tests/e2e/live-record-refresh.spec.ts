import { expect, test } from "./fixtures";
import { emptyTodayActivity, mockTraining, navigate } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`${width}px: LIVE更新の待機・一時失敗で本文と展開を保持し、権限喪失では消す`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.install();
    const state = await mockTraining(page);
    await navigate(page, "設定");
    let version = 1;
    let status = 200;
    let reads = 0;
    let hold: Promise<void> | null = null;
    let release = () => {};
    const record = () => ({
      id: "live-record",
      user_id: "friend",
      display_name: "仲間",
      group_id: state.group.id,
      performed_on: "2026-10-01",
      created_at: "2026-10-01T01:00:00Z",
      revision: version,
      exercises: [
        {
          name: "ベンチプレス",
          sets: Array.from({ length: 10 + version }, () => ({ weight: 80, reps: 8 })),
        },
      ],
    });
    await page.route("**/api/groups/today-activity", (route) => {
      const data = emptyTodayActivity([state.group]);
      Object.assign(data.groups[0], {
        live_count: 1,
        today_count: 1,
        members: [
          {
            id: "friend",
            display_name: "仲間",
            today: true,
            live: true,
            live_until: new Date(Date.now() + 600000).toISOString(),
          },
        ],
        feed: [
          {
            workout_id: "live-record",
            user_id: "friend",
            display_name: "仲間",
            exercise: "ベンチプレス",
            weight: 80,
            reps: 8,
            estimated_rm: 101,
            updated_at: `2026-10-01T01:00:0${version}Z`,
            best: false,
            summary: {
              exercise_count: 1,
              set_count: 10 + version,
              total_volume: 640 * (10 + version),
            },
          },
        ],
      });
      return route.fulfill({ json: data });
    });
    await page.route(`**/api/groups/${state.group.id}/workouts/live-record`, async (route) => {
      reads++;
      await hold;
      return route.fulfill({
        status,
        json: status === 200 ? record() : { detail: "取得できません" },
      });
    });
    try {
      await navigate(page, "ホーム");
      const card = page.locator('[data-workout-id="live-record"]');
      await expect(card.locator(".record-review:not(.is-pending)")).toBeVisible();
      await card.locator(".record-details").click();
      await expect(card.locator(".record-details.is-expanded")).toBeVisible();
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      const node = await card.locator(".record-review").elementHandle();
      const scrollTop = await page.evaluate(() => window.scrollY);
      const height = await card.evaluate((el) => el.getBoundingClientRect().height);
      hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      version = 2;
      const initialReads = reads;
      await page.clock.runFor(5000);
      await expect.poll(() => reads).toBeGreaterThan(initialReads);
      await page.screenshot({ path: test.info().outputPath("refresh-pending.png") });
      await expect(card.locator(".is-pending")).toHaveCount(0);
      expect(await node?.evaluate((el) => el.isConnected)).toBe(true);
      await expect(card.locator(".record-details.is-expanded")).toBeVisible();
      expect(await card.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollTop);
      release();
      hold = null;
      await expect(card.locator('[aria-label="セット数"] strong')).toHaveText("12");
      expect(await node?.evaluate((el) => el.isConnected)).toBe(true);
      status = 503;
      version = 3;
      const beforeFail = reads;
      await page.clock.runFor(5000);
      await expect.poll(() => reads).toBeGreaterThan(beforeFail);
      await expect(card.locator('[aria-label="セット数"] strong')).toHaveText("12");
      await expect(card.locator(".is-pending")).toHaveCount(0);
      status = 200;
      await page.clock.runFor(5000);
      await expect(card.locator('[aria-label="セット数"] strong')).toHaveText("13");
      // 再確認期限を過ぎても表示を消さず、遅い再取得を待つ。
      hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const beforeExpiry = reads;
      await page.clock.runFor(60_000);
      await expect.poll(() => reads).toBeGreaterThan(beforeExpiry);
      await expect(card.locator('[aria-label="セット数"] strong')).toHaveText("13");
      await expect(card.locator(".is-pending")).toHaveCount(0);
      expect(await node?.evaluate((el) => el.isConnected)).toBe(true);
      release();
      hold = null;
      await page.waitForResponse(
        (r) => r.url().endsWith("/workouts/live-record") && r.status() === 200,
      );
      status = 403;
      version = 4;
      await page.clock.runFor(5000);
      await expect(card.locator(".record-review:not(.is-pending)")).toHaveCount(0);
    } finally {
      release();
    }
  });
}

test("同じ記録でも共有先を切り替えたら以前の本文を使わず権限を再確認する", async ({ page }) => {
  const state = await mockTraining(page);
  await navigate(page, "設定");
  const groups = [state.group, { ...state.group, id: "other-group", name: "別の共有先" }];
  await page.route("**/api/groups", (route) => route.fulfill({ json: groups }));
  const data = emptyTodayActivity(groups);
  for (const group of data.groups)
    group.feed = [
      {
        workout_id: "same-record",
        user_id: "friend",
        display_name: "仲間",
        exercise: "スクワット",
        weight: 100,
        reps: 5,
        estimated_rm: 116.7,
        updated_at: "2026-10-01T01:00:00Z",
        best: false,
      },
    ];
  await page.route("**/api/groups/today-activity", (route) => route.fulfill({ json: data }));
  const record = {
    id: "same-record",
    user_id: "friend",
    display_name: "仲間",
    group_id: state.group.id,
    performed_on: "2026-10-01",
    created_at: "2026-10-01T01:00:00Z",
    revision: 1,
    exercises: [{ name: "スクワット", sets: [{ weight: 100, reps: 5 }] }],
  };
  await page.route(`**/api/groups/${state.group.id}/workouts/same-record`, (route) =>
    route.fulfill({ json: record }),
  );
  let release = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route("**/api/groups/other-group/workouts/same-record", async (route) => {
    reads++;
    await hold;
    return route.fulfill({ status: 403, json: { detail: "共有していません" } });
  });
  try {
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await navigate(page, "ホーム");
    const card = page.locator('[data-workout-id="same-record"]');
    await expect(card.locator(".record-details")).toBeVisible();
    await page
      .locator(".home-feed-tabs")
      .getByRole("button", { name: "別の共有先", exact: true })
      .click();
    await expect.poll(() => reads).toBe(1);
    await expect(card.locator(".record-details")).toHaveCount(0);
    release();
    await expect(card.locator(".record-pending-error")).toBeVisible();
    await expect(card.locator(".record-details")).toHaveCount(0);
  } finally {
    release();
  }
});
