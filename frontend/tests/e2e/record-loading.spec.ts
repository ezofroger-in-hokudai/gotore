import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

const day = "2026-09-13";
const monthActivity = (volume: number | null) => ({
  month: "2026-09",
  metric: "volume",
  total_volume: volume ?? 0,
  total_sets: volume === null ? 0 : 1,
  workout_count: volume === null ? 0 : 1,
  active_days: volume === null ? 0 : 1,
  days: volume === null ? [] : [{ date: day, volume, set_count: 1, workout_count: 1 }],
});

test("履歴カレンダーは再訪時の表示を保持し、認証エラー時は古い記録を隠す", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-13T03:00:00Z"));
  await mockTraining(page);
  let volume = 200;
  let fail = false;
  let hold: Promise<void> | null = null;
  let release = () => {};
  await page.route("**/api/workouts/activity?*", async (route) => {
    if (hold) await hold;
    if (fail) return route.fulfill({ status: 401, json: { detail: "ログインし直してください。" } });
    return route.fulfill({ json: monthActivity(volume) });
  });
  const calendar = page.locator(".personal-history-calendar");
  const cell = calendar.locator('button[aria-label*="9月13日"]');
  await navigate(page, "履歴");
  await expect(cell).toHaveAttribute("aria-label", /200kg/);
  await navigate(page, "ホーム");
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await navigate(page, "履歴");
  await expect(cell).toHaveAttribute("aria-label", /200kg/);
  volume = 300;
  release();
  hold = null;
  await expect(cell).toHaveAttribute("aria-label", /300kg/);
  await navigate(page, "ホーム");
  fail = true;
  await navigate(page, "履歴");
  await expect(calendar.getByRole("alert")).toContainText("ログインし直して");
  await expect(cell).not.toHaveAttribute("aria-label", /300kg/);
  fail = false;
  await calendar.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(cell).toHaveAttribute("aria-label", /300kg/);
});

test("ログアウト後の別利用者へ履歴カレンダーを引き継がない", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-13T03:00:00Z"));
  const state = await mockTraining(page);
  const originalId = state.user.id;
  await page.route("**/api/workouts/activity?*", (route) =>
    route.fulfill({ json: monthActivity(state.user.id === originalId ? 200 : null) }),
  );
  await navigate(page, "履歴");
  const cell = page.locator('.personal-history-calendar button[aria-label*="9月13日"]');
  await expect(cell).toHaveAttribute("aria-label", /200kg/);
  await navigate(page, "設定");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeVisible();
  state.user.id = "00000000-0000-0000-0000-000000000009";
  await page.getByLabel("メールアドレス", { exact: true }).fill("next@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("ui-test-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await navigate(page, "履歴");
  await expect(cell).toHaveAttribute("aria-label", /記録なし/);
  await expect(cell).not.toHaveAttribute("aria-label", /200kg/);
});
