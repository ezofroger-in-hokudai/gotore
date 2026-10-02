import { expect, test } from "./fixtures";
import { emptyTodayActivity, mockTraining, startTraining } from "./mock-training";
import { mockHistoryCalendar, openHistoryDay } from "./personal-history-helper";

const flags = [
  { exercise_index: 0, set_index: 0, weight: true, rm: false },
  { exercise_index: 0, set_index: 1, weight: false, rm: true },
];

test("日別履歴と共有本文は最高重量とRMを分け、最高値変更後も再照合する", async ({ page }) => {
  await page.clock.install();
  const state = await mockTraining(page, true, false, false);
  const record = {
    id: "best-record",
    user_id: state.user.id,
    display_name: "画面テスト",
    group_id: null,
    shared_group_ids: [state.group.id],
    revision: 2,
    performed_on: "2026-09-13",
    created_at: "2026-09-13T02:00:00Z",
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
  };
  await mockHistoryCalendar(page, () => [record]);
  await page.route("**/api/workouts?*", (route) => route.fulfill({ json: [record] }));
  await page.route("**/api/groups/*/workouts/best-record", (route) =>
    route.fulfill({ json: record }),
  );
  let bestRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/bests")) bestRequests++;
  });
  await page.route("**/api/groups/today-activity", (route) => {
    const activity = emptyTodayActivity([state.group]);
    activity.groups[0].feed = [
      {
        workout_id: record.id,
        user_id: record.user_id,
        display_name: record.display_name,
        exercise: "ベンチプレス",
        weight: 95,
        reps: 1,
        estimated_rm: 95,
        updated_at: record.created_at,
        best: record.best_sets.length > 0,
        best_weight: record.best_sets.length > 0,
        best_rm: false,
      },
    ];
    return route.fulfill({ json: activity });
  });
  const day = await openHistoryDay(page, record.performed_on);
  const rows = day.locator(".record-set");
  await expect(rows.nth(0).getByRole("img", { name: "自己最高重量", exact: true })).toBeVisible();
  await expect(rows.nth(1).getByRole("img", { name: "自己最高RM", exact: true })).toBeVisible();
  await expect(rows.nth(2).getByRole("img")).toHaveCount(0);
  await expect(rows.nth(0).locator(".personal-best-value")).toHaveText("95");
  await expect(rows.nth(1).locator(".personal-best-value")).toHaveText("106.7");
  await day.getByRole("button", { name: "閉じる", exact: true }).click();
  const { navigate } = await import("./mock-training");
  await navigate(page, "ホーム");
  const shared = page.locator('[data-workout-id="best-record"]');
  await expect(shared.locator(".record-set").getByRole("img")).toHaveCount(2);
  record.best_sets = [];
  await page.clock.runFor(15000);
  await expect(shared.locator(".record-set")).toHaveCount(3);
  await expect(shared.locator(".record-set").getByRole("img")).toHaveCount(0);
  expect(bestRequests).toBe(0);
});

test("記録のBESTは確定revisionだけで表示し、未送信・古い応答・訂正では誤表示しない", async ({
  page,
}) => {
  const state = await mockTraining(page);
  let stale = false;
  await page.route("**/api/exercises/context?*", (route) =>
    route.fulfill({
      json: {
        best_weight: 80,
        best_rm: 101.3,
        previous: { id: "previous", performed_on: "2026-09-12", sets: [{ weight: 80, reps: 8 }] },
        memo: { content: "", revision: 0 },
        current_bests: {
          revision: (state.session?.revision ?? 1) - (stale ? 1 : 0),
          sets: state.session?.exercises[0]?.sets[0]?.weight === 95 ? [flags[0]] : [],
        },
      },
    }),
  );
  await page.route("**/api/sessions/*/bests", (route) =>
    route.fulfill({
      json: {
        revision: state.session?.revision,
        sets: state.session?.exercises[0]?.sets[0]?.weight === 95 ? [flags[0]] : [],
      },
    }),
  );
  let bestRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/bests")) bestRequests++;
  });
  await startTraining(page);
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("95");
  await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("1");
  state.failSave = true;
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  const row = page.getByRole("button", { name: "セット1を編集", exact: true });
  await expect(row).toContainText("95kg");
  await expect(row.getByRole("img")).toHaveCount(0);
  expect(state.saves).toBe(0);
  state.failSave = false;
  stale = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => state.saves).toBe(1);
  await expect(row.getByRole("img")).toHaveCount(0);
  stale = false;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  await page.locator(".today-training summary").click();
  await expect(
    page.locator(".today-training").getByRole("img", { name: "自己最高重量", exact: true }),
  ).toBeVisible();
  await page
    .locator(".exercise-picker-list")
    .getByRole("button", { name: /^ベンチプレス/ })
    .click();
  await expect(row.getByRole("img", { name: "自己最高重量", exact: true })).toBeVisible();
  await page.reload();
  const { openTraining } = await import("./mock-training");
  await openTraining(page);
  await expect(row.getByRole("img", { name: "自己最高重量", exact: true })).toBeVisible();
  await row.click();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("70");
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  await expect.poll(() => state.session?.exercises[0].sets[0].weight).toBe(70);
  await expect(row.getByRole("img")).toHaveCount(0);
  expect(bestRequests).toBe(1);
});
