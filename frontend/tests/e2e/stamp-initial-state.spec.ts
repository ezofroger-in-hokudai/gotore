import { expect, test } from "@playwright/test";
import { mockTraining } from "./mock-training";

test("スタンプは集計待ち・取得失敗でも6種類を表示し、権限確認後に送信する", async ({ page }) => {
  const state = await mockTraining(page);
  const workoutId = "stamp-initial-state";
  state.session = {
    id: workoutId,
    user_id: state.user.id,
    display_name: "画面テスト",
    group_id: null,
    shared_group_ids: [state.group.id],
    performed_on: "2026-09-28",
    created_at: "2026-09-28T01:00:00Z",
    started_at: "2026-09-28T01:00:00Z",
    ended_at: null,
    revision: 1,
    exercises: [{ name: "ベンチプレス", sets: [{ weight: 60, reps: 10 }] }],
  };
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let summaryMode: "waiting" | "failed" | "ready" = "waiting";
  let summaryReads = 0;
  let writes = 0;
  let stampPresent = false;
  let failFirstWrite = true;
  await page.route("**/api/groups/*/stamps/summary", async (route) => {
    summaryReads++;
    if (summaryMode === "waiting") await gate;
    if (summaryMode === "failed")
      return route.fulfill({ status: 503, json: { detail: "一時的に取得できません" } });
    return route.fulfill({
      json: {
        [workoutId]: {
          counts: stampPresent ? { praise: 1 } : {},
          mine: stampPresent ? ["praise"] : [],
          can_send: true,
        },
      },
    });
  });
  await page.route(
    `**/api/groups/${state.group.id}/workouts/${workoutId}/stamps/praise`,
    (route) => {
      writes++;
      if (route.request().method() === "PUT" && failFirstWrite) {
        failFirstWrite = false;
        return route.fulfill({ status: 503, json: { detail: "送れませんでした" } });
      }
      stampPresent = route.request().method() === "PUT";
      return route.fulfill({ json: {} });
    },
  );
  try {
    await page.reload();
    const card = page.locator(`[data-workout-id="${workoutId}"]`);
    await expect(card.locator(".record-set")).toHaveCount(1);
    await expect.poll(() => summaryReads).toBeGreaterThan(0);
    await expect(card.locator(".inline-stamp-choice")).toHaveCount(6);
    const button = card.getByRole("button", { name: "👏スタンプ", exact: true });
    await expect(button).toBeDisabled();
    expect(writes).toBe(0);
    summaryMode = "failed";
    release();
    await expect.poll(() => summaryReads).toBeGreaterThan(1);
    await expect(card.locator(".inline-stamp-error")).toHaveCount(0);
    await expect(card.locator(".inline-stamp-choice")).toHaveCount(6);
    await expect(button).toBeDisabled();
    summaryMode = "ready";
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(button).toBeEnabled();
    await button.click();
    await expect.poll(() => writes).toBe(1);
    await expect
      .poll(async () =>
        page.evaluate(() =>
          Object.keys(localStorage).some(
            (key) =>
              key.startsWith("egotore:stamp-job:v1:") &&
              JSON.parse(localStorage.getItem(key) ?? "null")?.state === "failed",
          ),
        ),
      )
      .toBe(true);
    await expect(card.locator(".inline-stamp-error")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /スタンプの未送信を確認/ })).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => writes).toBe(2);
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await button.click();
    await expect.poll(() => writes).toBe(3);
    await expect(button).toHaveAttribute("aria-pressed", "false");
  } finally {
    release();
  }
});
