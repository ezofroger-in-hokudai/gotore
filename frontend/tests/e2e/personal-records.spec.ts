import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

const flags = [
  { exercise_index: 0, set_index: 0, weight: true, rm: false },
  { exercise_index: 0, set_index: 1, weight: false, rm: true },
];

test("本人の日別記録と共有カードで最高重量とRMを別々に強調する", async ({ page }) => {
  await page.clock.install();
  const state = await mockTraining(page);
  state.finished = [
    {
      id: "record-best",
      user_id: state.user.id,
      display_name: "画面テスト",
      group_id: null,
      shared_group_ids: [state.group.id],
      performed_on: "2026-09-13",
      created_at: "2026-09-13T02:00:00Z",
      started_at: "2026-09-13T02:00:00Z",
      ended_at: "2026-09-13T03:00:00Z",
      revision: 2,
      exercises: [
        {
          name: "ベンチプレス",
          sets: [
            { weight: 95, reps: 1 },
            { weight: 80, reps: 10 },
            { weight: 75, reps: 10 },
          ],
        },
      ],
      best_sets: flags,
    },
  ];
  await page.route("**/api/groups/*/workouts/record-best", (route) =>
    route.fulfill({ json: state.finished[0] }),
  );
  await page.route("**/api/workouts/activity?*", (route) =>
    route.fulfill({
      json: {
        month: new URL(route.request().url()).searchParams.get("month"),
        metric: "volume",
        total_volume: 1645,
        total_sets: 3,
        workout_count: 1,
        active_days: 1,
        days: [{ date: "2026-09-13", volume: 1645, set_count: 3, workout_count: 1 }],
      },
    }),
  );
  let celebrate = true;
  const updatedAt = "2026-09-13T03:00:00Z";
  await page.route("**/api/groups/today-activity", (route) =>
    route.fulfill({
      json: {
        totals: { set_count: 3, total_volume: 1645 },
        groups: [
          {
            group_id: state.group.id,
            name: state.group.name,
            member_count: 1,
            live_count: 0,
            today_count: 1,
            members: [{ id: state.user.id, display_name: "画面テスト", live: false, today: true }],
            totals: { set_count: 3, total_volume: 1645 },
            feed: [
              {
                workout_id: "record-best",
                user_id: state.user.id,
                display_name: "画面テスト",
                exercise: "ベンチプレス",
                weight: 95,
                reps: 1,
                estimated_rm: 95,
                updated_at: updatedAt,
                best: celebrate,
                best_weight: celebrate,
                best_rm: false,
                summary: { exercise_count: 1, set_count: 3, total_volume: 1645 },
              },
            ],
          },
        ],
      },
    }),
  );
  let bestRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/bests")) bestRequests++;
  });
  await page.reload();
  await navigate(page, "履歴");
  await page.locator('.personal-history-calendar button[aria-label*="9月13日"]').click();
  const sheet = page.getByRole("dialog", { name: /9月13日の全メニュー/ });
  await expect(sheet.locator(".record-set")).toHaveCount(3);
  await page.screenshot({ path: "test-results/personal-record-history.png", fullPage: true });
  const rows = sheet.locator(".record-set");
  await expect(rows.nth(0).getByRole("img", { name: "自己最高重量", exact: true })).toBeVisible();
  await expect(rows.nth(1).getByRole("img", { name: "自己最高RM", exact: true })).toBeVisible();
  await expect(rows.nth(2).getByRole("img")).toHaveCount(0);
  await expect(rows.nth(0).locator(".personal-best-value")).toHaveText("95");
  await expect(rows.nth(1).locator(".personal-best-value")).toHaveText("106.7");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/personal-record-detail.png", fullPage: true });
  await sheet.getByRole("button", { name: "閉じる", exact: true }).click();
  await navigate(page, "ホーム");
  const shared = page.getByRole("main").getByRole("article").filter({ hasText: "画面テスト" });
  await expect(shared.locator(".record-set").getByRole("img")).toHaveCount(2);
  await page.screenshot({ path: "test-results/personal-record-shared.png", fullPage: true });
  celebrate = false;
  state.finished[0].best_sets = [];
  await page.clock.runFor(15_000);
  await expect(shared.locator(".record-set").getByRole("img")).toHaveCount(0);
  await expect(shared.locator(".record-set")).toHaveCount(3);
  expect(bestRequests).toBe(0);
});

test("記録比較は未送信・古いrevisionで炎を出さず、保存と訂正後に既存の比較応答で更新する", async ({
  page,
}) => {
  const state = await mockTraining(page);
  state.options = state.options.map((option) =>
    option.name === "ベンチプレス"
      ? {
          ...option,
          primary_body_part: "chest",
          secondary_body_parts: ["shoulders", "arms"],
          revision: 1,
        }
      : option,
  );
  await page.reload();
  let bestRequests = 0;
  await page.route("**/api/exercises/context**", (route) =>
    route.fulfill({
      json: {
        best_weight: Math.max(80, state.session?.exercises[0]?.sets[0]?.weight ?? 0),
        best_rm: 101.3,
        previous: { id: "previous", performed_on: "2026-09-12", sets: [{ weight: 80, reps: 8 }] },
        memo: { content: "", revision: 0 },
        current_bests: {
          revision: state.session?.revision ?? 1,
          sets: state.session?.exercises[0]?.sets[0]?.weight === 95 ? [flags[0]] : [],
        },
      },
    }),
  );
  page.on("request", (request) => {
    if (request.url().includes("/bests")) bestRequests++;
  });
  await startTraining(page);
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("95");
  await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("1");
  state.failSave = true;
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  const savedRow = page.getByRole("button", { name: "セット1を編集", exact: true });
  await expect(savedRow).toBeVisible();
  expect(state.session?.exercises).toEqual([]);
  await expect(savedRow.getByRole("img")).toHaveCount(0);
  state.failSave = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => state.session?.exercises[0]?.sets).toEqual([{ weight: 95, reps: 1 }]);
  await expect(savedRow.getByRole("img", { name: "自己最高重量", exact: true })).toBeVisible();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect(page.getByRole("button", { name: "セットを追加", exact: true })).toBeInViewport();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/personal-record-recording.png", fullPage: true });
  await savedRow.click();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("70");
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  await expect.poll(() => state.session?.exercises[0]?.sets[0]?.weight).toBe(70);
  await expect(savedRow.getByRole("img")).toHaveCount(0);
  expect(bestRequests).toBe(0);
});

test("グループのフィードでは該当する重量またはRMだけを赤字と炎で示す", async ({ page }) => {
  const state = await mockTraining(page);
  await page.route(`**/api/groups/${state.group.id}/workouts/best`, (route) =>
    route.fulfill({
      json: {
        id: "best",
        user_id: "friend",
        display_name: "友達A",
        group_id: state.group.id,
        performed_on: "2026-09-13",
        created_at: "2026-09-13T01:00:00Z",
        revision: 1,
        exercises: [{ name: "ベンチプレス", sets: [{ weight: 80, reps: 10 }] }],
        best_sets: [{ exercise_index: 0, set_index: 0, weight: false, rm: true }],
      },
    }),
  );
  await page.route("**/api/groups/*/activity", (route) =>
    route.fulfill({
      json: {
        group_id: state.group.id,
        member_count: 1,
        live_count: 0,
        today_count: 1,
        members: [{ id: "friend", display_name: "友達A", live: false, today: true }],
        feed: [
          {
            workout_id: "best",
            user_id: "friend",
            display_name: "友達A",
            exercise: "ベンチプレス",
            weight: 80,
            reps: 10,
            estimated_rm: 106.7,
            updated_at: new Date().toISOString(),
            best: true,
            best_weight: false,
            best_rm: true,
            summary: { exercise_count: 1, set_count: 1, total_volume: 800 },
          },
        ],
      },
    }),
  );
  await page.reload();
  await navigate(page, "グループ");
  await page
    .locator(".group-card-list")
    .getByRole("button", { name: `${state.group.name}の詳細`, exact: true })
    .click();
  const feed = page.locator(".community-feed .record-set");
  await expect(feed.getByRole("img", { name: "自己最高RM", exact: true })).toBeVisible();
  await expect(feed.locator(".personal-best-value")).toHaveText("106.7");
  await page.screenshot({ path: "test-results/personal-record-feed.png", fullPage: true });
});
