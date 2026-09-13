import { expect, test } from "@playwright/test";
import { mockTraining, navigate, openTraining, startTraining } from "./mock-training";

test.use({ viewport: { width: 390, height: 720 } });

test("説明行を省いてRMを横に並べ、右の主ボタンで次セットへ進む", async ({ page }) => {
  await mockTraining(page);
  await startTraining(page);
  await expect(page.getByText("重量 × 回数 / RM", { exact: true })).toHaveCount(0);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 720 });
    const primary = await page
      .getByRole("button", { name: "次のセットへ", exact: true })
      .boundingBox();
    const next = await page.getByRole("button", { name: "次の種目へ", exact: true }).boundingBox();
    expect(primary?.x).toBeGreaterThan(next?.x ?? 0);
    const value = page.locator(".set-measurement").first();
    const weight = await value.locator("span").boundingBox();
    const rm = await value.locator("small").boundingBox();
    expect(Math.abs((weight?.y ?? 0) - (rm?.y ?? 0))).toBeLessThan(6);
    expect(rm?.x).toBeGreaterThan(weight?.x ?? 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test("今回の一覧は確定した最高記録を炎で示し、再起動・訂正・取得失敗でも整合する", async ({
  page,
}) => {
  const state = await mockTraining(page);
  let fail = false;
  await page.route("**/api/sessions/*/bests", (route) =>
    route.fulfill({
      status: fail ? 503 : 200,
      json: fail
        ? { detail: "読み込めません" }
        : {
            revision: state.session?.revision,
            sets:
              state.session?.exercises[0]?.sets[0]?.weight === 85
                ? [{ exercise_index: 0, set_index: 0 }]
                : [],
          },
    }),
  );
  await startTraining(page);
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("85");
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  const next = page.getByRole("button", { name: "次の種目へ", exact: true });
  const overview = page.getByRole("region", { name: "今回のトレーニング" });
  await next.click();
  await expect(overview.locator(".record-celebration")).toContainText("85kg");
  await expect(overview.locator(".record-celebration")).toContainText("🔥");
  await page.screenshot({ path: "test-results/session-overview-bests.png", fullPage: true });
  await page.reload();
  await openTraining(page);
  await next.click();
  await expect(overview.locator(".record-celebration")).toHaveCount(1);
  await page.getByRole("button", { name: /^ベンチプレス/ }).click();
  await page.getByRole("button", { name: "セット1を編集", exact: true }).click();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("70");
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  await next.click();
  await expect(overview.locator(".record-celebration")).toHaveCount(0);
  fail = true;
  await page.getByRole("button", { name: /^ベンチプレス/ }).click();
  await next.click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("読み込めません");
  await expect(overview.locator(".record-celebration")).toHaveCount(0);
});
