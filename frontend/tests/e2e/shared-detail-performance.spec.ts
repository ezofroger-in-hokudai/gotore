import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("表示中の詳細をLIVE優先で先読みし、終了済みは再取得を重ねず即表示する", async ({ page }) => {
  await page.clock.install();
  const state = await mockTraining(page);
  await navigate(page, "設定");
  const ended = {
    id: "ended",
    user_id: "ended-user",
    display_name: "終了した友達",
    group_id: state.group.id,
    performed_on: "2026-09-11",
    created_at: new Date().toISOString(),
    revision: 1,
    exercises: [{ name: "ベンチプレス", sets: [{ weight: 80, reps: 8 }] }],
  };
  const live = { ...ended, id: "live", user_id: "live-user", display_name: "LIVEの友達" };
  let version = 0;
  const requests: string[] = [];
  let hold = false;
  let fail = false;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/groups/${state.group.id}/activity`, (route) =>
    route.fulfill({
      json: {
        group_id: state.group.id,
        member_count: 3,
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
        feed: [ended, live].map((record) => ({
          workout_id: record.id,
          user_id: record.user_id,
          display_name: record.display_name,
          exercise: "ベンチプレス",
          weight: 80,
          reps: 8,
          estimated_rm: 101.3,
          updated_at: new Date(
            Date.parse(record.created_at) + (record.id === live.id ? version * 1000 : 0),
          ).toISOString(),
          best: false,
        })),
      },
    }),
  );
  await page.route(`**/api/groups/${state.group.id}/workouts/*`, async (route) => {
    const id = route.request().url().split("/").at(-1) || "";
    requests.push(id);
    if (hold) await gate;
    return fail
      ? route.fulfill({ status: 404, json: { detail: "記録を閲覧できません" } })
      : route.fulfill({ json: id === live.id ? live : ended });
  });
  await page.reload();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[0]).toBe(live.id);
  await page.clock.runFor(10000);
  expect(requests.filter((id) => id === ended.id)).toHaveLength(1);
  version++;
  await page.clock.runFor(5000);
  await expect.poll(() => requests.filter((id) => id === live.id).length).toBeGreaterThan(1);
  hold = true;
  await page.getByRole("button", { name: "終了した友達の記録詳細を開く", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "記録の詳細", exact: true });
  await expect(dialog.locator(".record-set")).toHaveCount(1);
  await page.screenshot({ path: "test-results/shared-detail-prefetch.png", fullPage: true });
  fail = true;
  release();
  await expect(dialog.getByRole("alert")).toContainText("記録を閲覧できません");
  await expect(dialog.locator(".record-set")).toHaveCount(0);
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await navigate(page, "記録");
  const stopped = requests.length;
  await page.clock.runFor(10000);
  expect(requests).toHaveLength(stopped);
});

test("履歴をホームで準備し、再確認待ちでも一覧とカレンダーを表示する", async ({ page }) => {
  const state = await mockTraining(page);
  await navigate(page, "設定");
  const record = {
    id: "history",
    user_id: state.user.id,
    display_name: "自分",
    group_id: null,
    performed_on: "2026-09-11",
    created_at: new Date().toISOString(),
    revision: 1,
    exercises: [{ name: "ベンチプレス", sets: [{ weight: 80, reps: 8 }] }],
  };
  let reads = 0;
  let months = 0;
  let hold = false;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workouts?*", async (route) => {
    reads++;
    if (hold) await gate;
    return route.fulfill({ json: [record] });
  });
  await page.route("**/api/workouts/activity?*", async (route) => {
    months++;
    if (hold) await gate;
    return route.fulfill({
      json: {
        month: "2026-09",
        metric: "score",
        best_score: null,
        total_sets: 1,
        workout_count: 1,
        active_days: 1,
        days: [{ date: "2026-09-11", set_count: 1, workout_count: 1 }],
      },
    });
  });
  await page.reload();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect.poll(() => months).toBeGreaterThan(0);
  hold = true;
  try {
    await navigate(page, "履歴");
    await expect(page.locator(".history-row")).toContainText("ベンチプレス");
    await expect(page.locator(".activity-totals")).toContainText("1セット");
    await page.screenshot({ path: "test-results/history-prefetch.png", fullPage: true });
  } finally {
    release();
  }
});

test("復元通信を待たずホームから記録画面へ進み、未確認中の開始は防ぐ", async ({ page }) => {
  await mockTraining(page);
  await navigate(page, "設定");
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
    await page
      .getByRole("button", { name: "トレーニングを記録", exact: true })
      .click({ timeout: 2000 });
    await expect(page.getByRole("heading", { name: "トレーニング", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "トレーニングを開始", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
});

for (const target of [0, 2]) {
  test(`先読みは同時2件までで、${target ? "未取得の詳細を優先する" : "取得中の詳細は要求を共用する"}`, async ({
    page,
  }) => {
    const state = await mockTraining(page);
    await navigate(page, "設定");
    const stamp = new Date().toISOString();
    const feed = Array.from({ length: 12 }, (_, i) => ({
      workout_id: `record-${i}`,
      user_id: `user-${i}`,
      display_name: `友達${i}`,
      exercise: "ベンチプレス",
      weight: 80,
      reps: 8,
      estimated_rm: 101.3,
      updated_at: stamp,
      best: false,
    }));
    await page.route(`**/api/groups/${state.group.id}/activity`, (route) =>
      route.fulfill({
        json: {
          group_id: state.group.id,
          member_count: 12,
          live_count: 0,
          today_count: 12,
          members: [],
          feed,
        },
      }),
    );
    const requests: string[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/groups/${state.group.id}/workouts/*`, async (route) => {
      const id = route.request().url().split("/").at(-1) || "";
      requests.push(id);
      await gate;
      return route.fulfill({
        json: {
          id,
          user_id: "user-0",
          display_name: "友達0",
          group_id: state.group.id,
          performed_on: "2026-09-11",
          created_at: stamp,
          revision: 1,
          exercises: [{ name: "ベンチプレス", sets: [{ weight: 80, reps: 8 }] }],
        },
      });
    });
    await page.reload();
    try {
      await expect.poll(() => requests.length).toBe(2);
      await page
        .getByRole("button", { name: `友達${target}の記録詳細を開く`, exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText("読み込み中");
      await expect.poll(() => requests.length).toBe(target ? 3 : 2);
      expect(requests).toContain(`record-${target}`);
      release();
      await expect(page.getByRole("dialog").locator(".record-set")).toHaveCount(1);
      expect(requests.filter((id) => id === `record-${target}`)).toHaveLength(1);
      expect(requests).not.toContain("record-11");
    } finally {
      release();
    }
  });
}

test("開いた記録が最新フィードから外れた後も、共有解除を再確認して内容を隠す", async ({ page }) => {
  await page.clock.install();
  const state = await mockTraining(page);
  await navigate(page, "設定");
  const record = {
    id: "previous",
    user_id: "friend",
    display_name: "友達A",
    group_id: state.group.id,
    performed_on: "2026-09-11",
    created_at: new Date().toISOString(),
    revision: 1,
    exercises: [{ name: "ベンチプレス", sets: [{ weight: 80, reps: 8 }] }],
  };
  let replaced = false;
  let removed = false;
  let reads = 0;
  await page.route(`**/api/groups/${state.group.id}/activity`, (route) =>
    route.fulfill({
      json: {
        group_id: state.group.id,
        member_count: 2,
        live_count: 0,
        today_count: 1,
        members: [],
        feed: [
          {
            workout_id: replaced ? "newer" : record.id,
            user_id: record.user_id,
            display_name: record.display_name,
            exercise: "ベンチプレス",
            weight: 80,
            reps: 8,
            estimated_rm: 101.3,
            updated_at: record.created_at,
            best: false,
          },
        ],
      },
    }),
  );
  await page.route(`**/api/groups/${state.group.id}/workouts/*`, (route) => {
    if (route.request().url().endsWith("/previous")) {
      reads++;
      if (removed) return route.fulfill({ status: 404, json: { detail: "記録を閲覧できません" } });
    }
    return route.fulfill({ json: record });
  });
  await page.reload();
  await page.getByRole("button", { name: "友達Aの記録詳細を開く", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "記録の詳細", exact: true });
  await expect(dialog.locator(".record-set")).toHaveCount(1);
  const before = reads;
  replaced = true;
  await page.clock.runFor(5000);
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(dialog.locator(".record-set")).toHaveCount(1);
  removed = true;
  await page.clock.runFor(5000);
  await expect(dialog.getByRole("alert")).toContainText("記録を閲覧できません");
  await expect(dialog.locator(".record-set")).toHaveCount(0);
});
