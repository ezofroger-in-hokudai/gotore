import { expect, test } from "@playwright/test";
import { mockTraining, navigate, openGroup, startTraining } from "./mock-training";

test("採点APIを使わず終了結果・履歴・ホーム・設定を表示する", async ({ page }) => {
  await mockTraining(page);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(me\/goal|.*score)/.test(request.url())) calls.push(request.url());
  });
  await startTraining(page);
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  await page.getByRole("button", { name: "今日のトレーニング終了", exact: true }).click();
  const result = page.getByRole("region", { name: "トレーニング結果" });
  await expect(result).toBeVisible();
  await expect(result).not.toContainText(/TRAINING COMPLETE|今日の積み重ね/);
  await expect(result.locator(".result-volume")).toContainText("640kg");
  await expect(result.locator(".result-totals")).toContainText("1 セット");
  await expect(result).not.toContainText(/SCORE|採点|目標への一言|計測中/);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/volume-result-mobile.png",
    fullPage: true,
  });
  await result.getByRole("button", { name: "履歴", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await page.locator(".history-row").click();
  await expect(page.locator(".history-detail")).toBeVisible();
  const detail = page.locator(".history-detail");
  await expect(detail.locator(".exercise-summary")).toHaveCount(0);
  await expect(detail.locator("summary").filter({ hasText: "セット詳細" })).toHaveCount(0);
  await expect(detail.getByRole("table")).toBeVisible();
  await page.screenshot({ path: "test-results/ui-copy-history-detail.png", fullPage: true });
  await expect(page.locator(".history-detail")).not.toContainText(/SCORE|スコア/);
  await navigate(page, "ホーム");
  await expect(page.locator(".feed-item")).toBeVisible();
  await expect(page.locator(".score-badge")).toHaveCount(0);
  await navigate(page, "設定");
  await expect(page.getByRole("button", { name: /^自分の目標/ })).toHaveCount(0);
  await openGroup(page);
  await expect(page.getByRole("button", { name: /SCOREの配点/ })).toHaveCount(0);
  expect(calls).toEqual([]);
});
