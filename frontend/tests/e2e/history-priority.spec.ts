import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`${width}pxで直近の記録を先に表示し、一覧展開と詳細からの復帰を保つ`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    const state = await mockTraining(page);
    let reads = 0;
    await page.route("**/api/workouts?**", (route) => {
      reads++;
      const offset = Number(new URL(route.request().url()).searchParams.get("offset") ?? 0);
      return route.fulfill({
        json: Array.from({ length: offset ? 1 : 50 }, (_, index) => ({
          id: `record-${offset + index}`,
          user_id: state.user.id,
          display_name: "画面テスト",
          group_id: null,
          performed_on: "2026-09-12",
          created_at: "2026-09-12T00:00:00Z",
          revision: 1,
          exercises: [
            { name: `記録${offset + index + 1}の種目`, sets: [{ weight: 20, reps: 10 }] },
          ],
        })),
      });
    });
    await navigate(page, "履歴");
    const rows = page.locator(".history-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("記録1の種目");
    await expect(rows.first()).toBeInViewport({ ratio: 1 });
    expect((await rows.last().boundingBox())?.y).toBeLessThan(
      (await page.getByLabel("月", { exact: true }).boundingBox())?.y ?? 0,
    );
    await expect(page.getByRole("heading", { name: "SCOREカレンダー", exact: true })).toBeVisible();
    const initialReads = reads;
    await page.screenshot({ path: `test-results/history-priority-${width}.png`, fullPage: false });
    await rows.first().click();
    await expect(page.getByRole("button", { name: "編集", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "コピー", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "‹ 履歴", exact: true }).click();
    await page.getByRole("button", { name: "もっと見る", exact: true }).click();
    await expect(rows).toHaveCount(50);
    expect(reads).toBe(initialReads);
    await rows.last().click();
    await expect(page.locator(".history-detail")).toContainText("記録50の種目");
    await page.getByRole("button", { name: "‹ 履歴", exact: true }).click();
    await expect(rows).toHaveCount(50);
    await page.getByRole("button", { name: "以前の記録", exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("記録51の種目");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test("履歴の読込中・取得失敗・空の記録を区別し、その場で再試行できる", async ({ page }) => {
  await mockTraining(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  await page.route("**/api/workouts?**", async (route) => {
    await gate;
    return route.fulfill(
      fail ? { status: 503, json: { detail: "記録を取得できません" } } : { json: [] },
    );
  });
  try {
    await navigate(page, "履歴");
    await expect(page.getByRole("status").filter({ hasText: "読み込み中" })).toBeVisible();
    await expect(page.getByText("まだ記録がありません", { exact: true })).toHaveCount(0);
    release();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("記録を取得できません");
    await expect(page.getByText("まだ記録がありません", { exact: true })).toHaveCount(0);
    fail = false;
    await page.getByRole("button", { name: "再試行", exact: true }).click();
    await expect(page.getByText("まだ記録がありません", { exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  } finally {
    release();
  }
});
