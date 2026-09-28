import { expect, test } from "@playwright/test";
import { mockTraining, openTraining } from "./mock-training";

test("ホームで表示済みの仲間記録を即表示し、再確認の更新と権限喪失を反映する", async ({ page }) => {
  const state = await mockTraining(page);
  const record = {
    id: "friend-record",
    user_id: "friend",
    display_name: "友達A",
    group_id: state.group.id,
    performed_on: "2026-09-28",
    created_at: "2026-09-28T01:00:00Z",
    revision: 1,
    exercises: [{ name: "スクワット", sets: [{ weight: 100, reps: 5 }] }],
  };
  await page.route("**/api/groups/today-activity", (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            group_id: state.group.id,
            name: state.group.name,
            member_count: 2,
            live_count: 0,
            today_count: 1,
            members: [{ id: "friend", display_name: "友達A", live: false, today: true }],
            feed: [
              {
                workout_id: record.id,
                user_id: record.user_id,
                display_name: record.display_name,
                exercise: "スクワット",
                weight: 100,
                reps: 5,
                estimated_rm: 116.7,
                updated_at: record.created_at,
                best: false,
                summary: { exercise_count: 1, set_count: 1, total_volume: 500 },
              },
            ],
            totals: { set_count: 1, total_volume: 500 },
          },
        ],
        totals: { set_count: 1, total_volume: 500 },
      },
    }),
  );
  let reads = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let forbid = false;
  let holdMiss = false;
  let releaseMiss: () => void = () => {};
  const missGate = new Promise<void>((resolve) => {
    releaseMiss = resolve;
  });
  await page.route(`**/api/groups/${state.group.id}/workouts/${record.id}`, async (route) => {
    reads++;
    if (forbid) return route.fulfill({ status: 403, json: { detail: "記録を閲覧できません" } });
    if (holdMiss) await missGate;
    if (reads > 1) await gate;
    return route.fulfill({
      json:
        reads > 1
          ? {
              ...record,
              revision: 2,
              exercises: [{ name: "スクワット", sets: [{ weight: 105, reps: 5 }] }],
            }
          : record,
    });
  });
  await page.reload();
  await expect(page.locator(`[data-workout-id="${record.id}"] .record-set`)).toHaveCount(1);
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  await expect(page.getByRole("button", { name: "友達Aの今日の記録を開く" })).toBeVisible();
  try {
    const tappedAt = Date.now();
    await page.getByRole("button", { name: "友達Aの今日の記録を開く" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".record-set")).toContainText("100");
    await test.info().attach("tap-to-content-ms", {
      body: Buffer.from(String(Date.now() - tappedAt)),
      contentType: "text/plain",
    });
    await expect(dialog.locator(".peer-record-placeholder")).toHaveCount(0);
    await expect.poll(() => reads).toBe(2);
    await page.screenshot({ path: "../docs/images/issue-230/after.png", fullPage: true });
    await expect(dialog.getByRole("button", { name: "💪スタンプ" })).toBeDisabled();
    release();
    await expect(dialog.locator(".record-set")).toContainText("105");
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    forbid = true;
    await page.getByRole("button", { name: "友達Aの今日の記録を開く" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("記録を閲覧できません");
    await expect(page.getByRole("dialog").locator(".record-set")).toHaveCount(0);
    await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
    forbid = false;
    holdMiss = true;
    await page.getByRole("button", { name: "友達Aの今日の記録を開く" }).click();
    await expect(page.getByRole("dialog").locator(".peer-record-placeholder")).toContainText(
      "友達A · スクワット · 1セット",
    );
  } finally {
    release();
    releaseMiss();
  }
});
