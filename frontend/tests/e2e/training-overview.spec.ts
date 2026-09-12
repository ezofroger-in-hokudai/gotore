import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("開始前の振り返りと履歴は先読みを共用し、取得待ちでも開始できる", async ({ page }) => {
  const state = await mockTraining(page);
  await navigate(page, "設定");
  let reads = 0;
  let hold = false;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const records = [11, 9, 7, 5].map((day, i) => ({
    id: `past-${day}`,
    user_id: state.user.id,
    display_name: "画面テスト",
    group_id: null,
    performed_on: `2026-09-${String(day).padStart(2, "0")}`,
    created_at: "2026-09-11T12:00:00Z",
    exercises: [
      {
        name: "ベンチプレス",
        sets: [
          { weight: 60 - i * 5, reps: 10 },
          { weight: 60 - i * 5, reps: 8 },
        ],
      },
      { name: "スクワット", sets: [{ weight: 80 - i * 5, reps: 8 }] },
    ],
  }));
  await page.route("**/api/workouts?*", async (route) => {
    reads++;
    if (hold) await gate;
    return route.fulfill({ json: records });
  });
  await navigate(page, "ホーム");
  await expect.poll(() => reads).toBe(1);
  await expect(page.locator(".training-overview-total")).toContainText("1,720");
  hold = true;
  try {
    await navigate(page, "記録");
    const overview = page.getByRole("region", { name: "これまでのトレーニング", exact: true });
    await expect(overview).toContainText("前回のトレーニング");
    await expect(overview).toContainText("推定1RM 80kg");
    await expect(overview.getByRole("img")).toBeVisible();
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^スクワット/ })).toHaveCount(0);
    await expect.poll(() => reads).toBe(2);
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await expect(
        page.getByRole("button", { name: "トレーニングを開始", exact: true }),
      ).toBeInViewport();
      await page.screenshot({
        path: `test-results/training-overview-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
    await page.getByRole("button", { name: "履歴・グラフを見る ›", exact: true }).click();
    await expect(page.locator(".history-row")).toHaveCount(3);
    await page.getByRole("button", { name: "もっと見る", exact: true }).click();
    await expect(page.locator(".history-row")).toHaveCount(4);
    expect(reads).toBe(2);
    await navigate(page, "記録");
    await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
    await expect(page.getByRole("heading", { name: "種目を選択", exact: true })).toBeVisible();
  } finally {
    release();
  }
});

test("振り返りの空状態と取得失敗を分け、再試行で表示を戻す", async ({ page }) => {
  await mockTraining(page);
  await navigate(page, "記録");
  const overview = page.getByRole("region", { name: "これまでのトレーニング", exact: true });
  await expect(overview).toContainText("最初のトレーニングを記録してみましょう。");
  let fail = true;
  await page.route("**/api/workouts?*", (route) =>
    fail ? route.abort() : route.fulfill({ json: [] }),
  );
  await navigate(page, "設定");
  await navigate(page, "記録");
  await expect(overview.getByRole("alert")).toBeVisible();
  await expect(overview).not.toContainText("最初のトレーニングを記録してみましょう。");
  await expect(page.getByRole("button", { name: "トレーニングを開始", exact: true })).toBeEnabled();
  fail = false;
  await overview.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(overview.getByRole("alert")).toHaveCount(0);
  await expect(overview).toContainText("最初のトレーニングを記録してみましょう。");
});
