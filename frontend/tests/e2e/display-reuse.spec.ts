import { dateLabel } from "../../src/features/activity/calendar";
import { today } from "../../src/features/training/draft";
import { expect, test } from "./fixtures";
import { mockTraining, navigate, startTraining } from "./mock-training";

test("グループカレンダー再訪の更新待ちでも記録表示と日付操作を維持する", async ({ page }) => {
  const state = await mockTraining(page);
  const day = today();
  let requests = 0;
  let release = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route(`**/api/groups/${state.group.id}/workouts/activity?*`, async (route) => {
    requests++;
    if (requests > 1) await gate;
    await route.fulfill({
      json: {
        month: day.slice(0, 7),
        active_days: 1,
        total_volume: 640,
        days: [{ date: day, volume: 640, set_count: 1, workout_count: 1 }],
      },
    });
  });
  await navigate(page, "グループ");
  await page.locator(".group-card-list .community-card").first().click();
  const tabs = page.getByRole("navigation", { name: "グループの表示" });
  const cell = page
    .locator(".group-history-calendar")
    .getByRole("button", { name: new RegExp(`^${dateLabel(day)}、`) });
  await tabs.getByRole("button", { name: "カレンダー", exact: true }).click();
  await expect(cell).toContainText("640kg");
  await tabs.getByRole("button", { name: "設定", exact: true }).click();
  try {
    await tabs.getByRole("button", { name: "カレンダー", exact: true }).click();
    await expect.poll(() => requests).toBe(2);
    await expect(cell).toBeEnabled();
    await expect(cell).toContainText("640kg");
  } finally {
    release();
  }
  await expect(cell).toContainText("640kg");
});

test("ホームで取得済みのグループ活動を一覧の更新待ちでも表示する", async ({ page }) => {
  const state = await mockTraining(page);
  let requests = 0;
  let release = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/groups/today-activity", async (route) => {
    requests++;
    if (requests > 1) await gate;
    await route.fulfill({
      json: {
        groups: [
          {
            group_id: state.group.id,
            name: state.group.name,
            member_count: 1,
            live_count: 0,
            today_count: 1,
            members: [],
            feed: [],
          },
        ],
      },
    });
  });
  await page.reload();
  await expect(page.locator(".community-card").first()).toContainText("0人がトレーニング中");
  try {
    await navigate(page, "グループ");
    await expect.poll(() => requests).toBe(2);
    const card = page.locator(".group-card-list .community-card").first();
    await expect(card).toContainText("0人がトレーニング中");
    await expect(card).not.toContainText("—人");
  } finally {
    release();
  }
  await expect(page.locator(".group-card-list .community-card").first()).toContainText(
    "0人がトレーニング中",
  );
});

test("終了確認を閉じるだけでは週間履歴を取得せず再度開いた際に確認する", async ({ page }) => {
  await page.clock.install();
  await mockTraining(page);
  let requests = 0;
  await page.route("**/api/workouts?*", (route) => {
    if (!new URL(route.request().url()).searchParams.has("date_from")) return route.fallback();
    requests++;
    return route.fulfill({ json: [] });
  });
  await startTraining(page);
  await expect.poll(() => requests).toBeGreaterThan(0);
  const initial = requests;
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  await expect.poll(() => requests).toBe(initial + 1);
  const dialog = page.getByRole("dialog", {
    name: "トレーニング終了",
    exact: true,
  });
  await dialog.getByRole("button", { name: "トレーニングに戻る", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.clock.runFor(1000);
  expect(requests).toBe(initial + 1);
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  await expect.poll(() => requests).toBe(initial + 2);
});

for (const status of [503, 403]) {
  test(`グループカレンダーの再取得${status}では共有データの保持可否を区別する`, async ({
    page,
  }) => {
    const state = await mockTraining(page);
    const day = today();
    let requests = 0;
    await page.route(`**/api/groups/${state.group.id}/workouts/activity?*`, (route) => {
      requests++;
      return requests === 1
        ? route.fulfill({
            json: {
              month: day.slice(0, 7),
              active_days: 1,
              total_volume: 640,
              days: [{ date: day, volume: 640, set_count: 1, workout_count: 1 }],
            },
          })
        : route.fulfill({ status, json: { detail: "カレンダーを確認できません" } });
    });
    await navigate(page, "グループ");
    await page.locator(".group-card-list .community-card").first().click();
    const tabs = page.getByRole("navigation", { name: "グループの表示" });
    const calendar = page.locator(".group-history-calendar");
    const cell = calendar.getByRole("button", { name: new RegExp(`^${dateLabel(day)}、`) });
    await tabs.getByRole("button", { name: "カレンダー", exact: true }).click();
    await expect(cell).toContainText("640kg");
    await tabs.getByRole("button", { name: "設定", exact: true }).click();
    await tabs.getByRole("button", { name: "カレンダー", exact: true }).click();
    await expect(calendar.getByRole("alert")).toContainText(
      status === 503 ? "前回の内容を表示しています" : "カレンダーを確認できません",
    );
    if (status === 503) {
      await expect(cell).toContainText("640kg");
      await expect(cell).toBeEnabled();
    } else {
      await expect(cell).not.toContainText("640kg");
      await expect(cell).toBeDisabled();
    }
  });
}

test("グループカレンダーはタブ間で前月を保持し、非表示中は取得しない", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-28T03:00:00Z") });
  const state = await mockTraining(page);
  const months: string[] = [];
  await page.route(`**/api/groups/${state.group.id}/workouts/activity?*`, (route) => {
    const month = new URL(route.request().url()).searchParams.get("month") ?? "";
    months.push(month);
    return route.fulfill({ json: { month, active_days: 0, total_volume: 0, days: [] } });
  });
  await navigate(page, "グループ");
  await page.locator(".group-card-list .community-card").first().click();
  const tabs = page.getByRole("navigation", { name: "グループの表示" });
  await tabs.getByRole("button", { name: "カレンダー", exact: true }).click();
  const calendar = page.locator(".group-history-calendar .personal-history-calendar");
  await expect.poll(() => months).toEqual(["2026-09"]);
  await calendar.dispatchEvent("pointerdown", { clientX: 160, clientY: 400 });
  await calendar.dispatchEvent("pointerup", { clientX: 260, clientY: 401 });
  await expect.poll(() => months).toEqual(["2026-09", "2026-08"]);
  await tabs.getByRole("button", { name: "設定", exact: true }).click();
  await page.clock.runFor(65_000);
  expect(months).toEqual(["2026-09", "2026-08"]);
  await tabs.getByRole("button", { name: "カレンダー", exact: true }).click();
  await expect(calendar.locator(".personal-history-month strong")).toHaveText("2026年8月");
  await expect.poll(() => months).toEqual(["2026-09", "2026-08", "2026-08"]);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: `test-results/group-calendar-reuse-${width}.png` });
  }
});

test("活動の失敗では一時エラーの表示を保持し、権限失効後は両画面で隠す", async ({ page }) => {
  const state = await mockTraining(page);
  let status = 200;
  await page.route("**/api/groups/today-activity", (route) =>
    route.fulfill(
      status === 200
        ? {
            json: {
              groups: [
                {
                  group_id: state.group.id,
                  name: state.group.name,
                  member_count: 1,
                  live_count: 0,
                  today_count: 1,
                  members: [],
                  feed: [],
                },
              ],
            },
          }
        : { status, json: { detail: "活動の確認失敗" } },
    ),
  );
  await page.reload();
  await expect(page.locator(".community-card").first()).toContainText("0人がトレーニング中");
  status = 503;
  await navigate(page, "グループ");
  const card = page.locator(".group-card-list .community-card").first();
  await expect(
    page.getByRole("alert").filter({ hasText: "前回の内容を表示しています" }),
  ).toBeVisible();
  await expect(card).toContainText("0人がトレーニング中");
  status = 403;
  await navigate(page, "ホーム");
  await expect(page.locator(".community-card").first()).not.toContainText("0人がトレーニング中");
  await navigate(page, "グループ");
  await expect(card).toContainText("状況を確認中");
});

test("参加グループ変更後は古い活動結果を新しい一覧へ引き継がない", async ({ page }) => {
  await page.clock.install();
  const state = await mockTraining(page);
  let groups = [state.group];
  let hold = false;
  let requests = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/groups", (route) => route.fulfill({ json: groups }));
  await page.route("**/api/groups/today-activity", async (route) => {
    requests++;
    if (hold) await gate;
    await route.fulfill({
      json: {
        groups: groups.map((group) => ({
          group_id: group.id,
          name: group.name,
          member_count: 1,
          live_count: 0,
          today_count: 1,
          members: [],
          feed: [],
        })),
      },
    });
  });
  await page.reload();
  await expect(page.locator(".community-card").first()).toContainText("0人がトレーニング中");
  hold = true;
  groups = [state.group, { ...state.group, id: "another-group", name: "別のグループ" }];
  try {
    await navigate(page, "設定");
    await navigate(page, "グループ");
    await expect(page.locator(".group-card-list .community-card")).toHaveCount(2);
    await expect(page.locator(".group-card-list .community-card").first()).toContainText(
      "状況を確認中",
    );
    await expect(page.locator(".group-card-list .community-card").nth(1)).toContainText(
      "状況を確認中",
    );
    await expect.poll(() => requests).toBeGreaterThan(1);
  } finally {
    release();
  }
  await expect(page.locator(".group-card-list .community-card").nth(1)).toContainText(
    "0人がトレーニング中",
  );
  hold = false;
  groups = [groups[1]];
  await navigate(page, "設定");
  await navigate(page, "ホーム");
  await expect(page.locator(".group-carousel .community-card")).toHaveCount(1);
  await expect(page.locator(".community-card").first()).toContainText("別のグループ");
  await expect(page.locator(".community-card").first()).not.toContainText(state.group.name);
});

test("終了確認を閉じた後も取得を完了し、再度開く際の更新待ちに使う", async ({ page }) => {
  await mockTraining(page);
  let requests = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workouts?*", async (route) => {
    if (!new URL(route.request().url()).searchParams.has("date_from")) return route.fallback();
    requests++;
    if (requests === 2) await gate;
    if (requests >= 3) return route.fulfill({ status: 503, json: { detail: "更新失敗" } });
    const day = new URL(route.request().url()).searchParams.get("date_to");
    await route.fulfill({
      json:
        requests === 1
          ? []
          : [
              {
                id: "previous-training",
                user_id: "00000000-0000-0000-0000-000000000001",
                display_name: "本人",
                performed_on: day,
                created_at: `${day}T00:00:00Z`,
                revision: 1,
                exercises: [{ name: "スクワット", sets: [{ weight: 100, reps: 10 }] }],
              },
            ],
    });
  });
  await startTraining(page);
  await expect.poll(() => requests).toBe(1);
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  await expect.poll(() => requests).toBe(2);
  const dialog = page.getByRole("dialog", { name: "トレーニング終了", exact: true });
  const response = page.waitForResponse((response) =>
    response.url().includes("/api/workouts?date_from="),
  );
  try {
    await dialog.getByRole("button", { name: "トレーニングに戻る", exact: true }).click();
  } finally {
    release();
  }
  await response;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  await expect.poll(() => requests).toBe(3);
  await expect(dialog.locator(".finish-dialog-day-detail")).toContainText("1,000kg");
});

test("グループグラフの再訪で更新待ちでも取得済み推移と選んだ指標を保持する", async ({ page }) => {
  const state = await mockTraining(page);
  let requests = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/groups/${state.group.id}/analytics?*`, async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get("period") === "all") {
      requests++;
      if (requests > 1) await gate;
    }
    const point = {
      start: "2026-09-01",
      end: "2026-09-30",
      volume: 640,
      sets: 8,
      people: 1,
      days: 1,
      weight: null,
      rm: null,
    };
    await route.fulfill({
      json: {
        window: { period: "all", start: "2026-09-01", end: "2026-09-30" },
        totals: point,
        series: { week: [point], month: [point] },
        exercises: [],
        rankings: {},
      },
    });
  });
  await navigate(page, "グループ");
  await page.locator(".group-card-list .community-card").first().click();
  const tabs = page.getByRole("navigation", { name: "グループの表示" });
  await tabs.getByRole("button", { name: "グラフ", exact: true }).click();
  const graph = page.locator(".group-history-graph");
  await expect(graph.getByRole("img", { name: "総負荷の推移" })).toBeVisible();
  await graph.getByRole("button", { name: "セット数", exact: true }).click();
  await tabs.getByRole("button", { name: "設定", exact: true }).click();
  try {
    await tabs.getByRole("button", { name: "グラフ", exact: true }).click();
    await expect.poll(() => requests).toBe(2);
    await expect(graph.getByRole("button", { name: "セット数", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(graph.getByRole("img", { name: "セット数の推移" })).toBeVisible();
  } finally {
    release();
  }
});

test("全グループから退出した後の再参加では以前の活動表示を復元しない", async ({ page }) => {
  const state = await mockTraining(page);
  let groups = [state.group];
  let hold = false;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/groups", (route) => route.fulfill({ json: groups }));
  await page.route("**/api/groups/today-activity", async (route) => {
    if (hold) await gate;
    await route.fulfill({
      json: {
        groups: groups.map((group) => ({
          group_id: group.id,
          name: group.name,
          member_count: 1,
          live_count: 0,
          today_count: 1,
          members: [],
          feed: [],
        })),
      },
    });
  });
  await page.reload();
  await expect(page.locator(".group-carousel .community-card")).toContainText(
    "0人がトレーニング中",
  );
  groups = [];
  await navigate(page, "設定");
  await navigate(page, "ホーム");
  await expect(page.locator(".group-carousel .community-card")).toHaveCount(0);
  groups = [state.group];
  hold = true;
  try {
    await navigate(page, "設定");
    await navigate(page, "ホーム");
    await expect(page.locator(".group-carousel .community-card")).toContainText("状況を確認中");
    await expect(page.locator(".group-carousel .community-card")).not.toContainText(
      "0人がトレーニング中",
    );
  } finally {
    release();
  }
  await expect(page.locator(".group-carousel .community-card")).toContainText(
    "0人がトレーニング中",
  );
});

test("ホームは再訪時に活動を保持し、権限エラー時は古い共有内容を隠す", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect.poll(() => state.session?.exercises[0]?.sets.length).toBe(1);
  await navigate(page, "ホーム");
  await expect(page.locator(".community-feed")).toContainText("ベンチプレス");
  await navigate(page, "設定");
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/groups/today-activity", async (route) => {
    await gate;
    return route.fulfill({ status: 403, json: { detail: "このグループを閲覧できません" } });
  });
  await navigate(page, "ホーム");
  try {
    await expect(page.locator(".community-feed")).toContainText("ベンチプレス", { timeout: 1000 });
  } finally {
    release();
  }
  await expect(page.locator(".v2-app [role=alert]:visible")).toContainText("閲覧できません");
  await expect(page.locator(".community-feed")).toHaveCount(0);
});
