import { expect, test } from "@playwright/test";
import { addDays } from "../../src/features/analytics/period";
import { mockTraining, startTraining } from "./mock-training";

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());

test("終了確認に7日分を表示し、同日2回を合算して今回と分ける", async ({ page }) => {
  const state = await mockTraining(page);
  const date = today();
  state.finished.push(
    {
      id: "first-today",
      user_id: state.user.id,
      display_name: "画面テスト",
      group_id: null,
      performed_on: date,
      created_at: `${date}T00:00:00Z`,
      started_at: `${date}T00:00:00Z`,
      ended_at: `${date}T01:00:00Z`,
      revision: 1,
      exercises: [{ name: "スクワット", sets: [{ weight: 140, reps: 10 }] }],
    },
    {
      id: "previous-day",
      user_id: state.user.id,
      display_name: "画面テスト",
      group_id: null,
      performed_on: addDays(date, -1),
      created_at: `${addDays(date, -1)}T00:00:00Z`,
      started_at: `${addDays(date, -1)}T00:00:00Z`,
      ended_at: `${addDays(date, -1)}T01:00:00Z`,
      revision: 1,
      exercises: [{ name: "スクワット", sets: [{ weight: 412, reps: 10 }] }],
    },
  );
  await startTraining(page);
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect.poll(() => state.session?.exercises[0]?.sets.length).toBe(1);
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("70");
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "トレーニング終了", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".finish-dialog-volume")).toContainText("640");
  await expect(dialog.locator(".finish-dialog-day")).toHaveCount(7);
  await expect(dialog.locator(".finish-dialog-day-detail")).toContainText("2回合計");
  await expect(dialog.locator(".finish-dialog-day-detail")).toContainText("2,040kg");
  await expect(dialog).toContainText("今回のトレーニングを終了しますか？");
  await expect(dialog).toContainText("入力中の数値はまだセットに追加されていません");
  await expect(dialog).not.toContainText("前の活動日より");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 700 });
    const bounds = await dialog.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? width) + (bounds?.width ?? 1)).toBeLessThanOrEqual(width);
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect((bounds?.y ?? 700) + (bounds?.height ?? 1)).toBeLessThanOrEqual(700);
    if (width === 390) await page.screenshot({ path: "test-results/finish-confirmation.png" });
  }
  await dialog.getByRole("button", { name: new RegExp(addDays(date, -1)) }).click();
  await expect(dialog.locator(".finish-dialog-day-detail")).toContainText("4,120kg");
  await dialog.getByRole("button", { name: "トレーニングに戻る" }).click();
  await expect(dialog).toBeHidden();
  expect(state.finished).toHaveLength(2);
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  await dialog.getByRole("button", { name: "終了する", exact: true }).click();
  await expect.poll(() => state.finished.length).toBe(3);
});

test("過去記録の取得待ちでも終了を止めない", async ({ page }) => {
  const state = await mockTraining(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/workouts\?date_from=/, async (route) => {
    await gate;
    await route.fallback();
  });
  try {
    await startTraining(page);
    await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "トレーニング終了", exact: true });
    await expect(dialog.locator(".finish-dialog-day")).toHaveCount(7);
    await expect(dialog.getByRole("button", { name: "終了する", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "終了する", exact: true }).click();
    await expect.poll(() => state.finished.length).toBe(1);
  } finally {
    release();
  }
});

test("過去記録の取得失敗を0kgと見せず、確認を閉じて記録へ戻れる", async ({ page }) => {
  await mockTraining(page);
  await page.route(/\/api\/workouts\?date_from=/, (route) =>
    route.fulfill({ status: 503, json: { detail: "取得できません" } }),
  );
  await startTraining(page);
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "トレーニング終了", exact: true });
  await expect(dialog.locator(".finish-dialog-day")).toHaveCount(7);
  await expect(dialog.locator(".finish-dialog-day-detail")).toContainText("—");
  await expect(dialog.getByRole("button", { name: "終了する", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "トレーニングに戻る", exact: true }).click();
  await expect(dialog).toBeHidden();
});
