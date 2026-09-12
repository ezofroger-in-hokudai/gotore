import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`${width}pxでホームから開始し、グループナビとRESUMEから同じ記録へ戻る`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const state = await mockTraining(page);
    const nav = page.getByRole("navigation", { name: "メインナビゲーション" });
    await expect(nav.getByRole("button")).toHaveText(["ホーム", "グループ", "履歴", "設定"]);
    const floating = page.getByTestId("floating-training");
    await expect(floating).toHaveText("START");
    const actionBox = await floating.boundingBox();
    const navBox = await nav.boundingBox();
    expect((actionBox?.y ?? 0) + (actionBox?.height ?? 0)).toBeLessThan(navBox?.y ?? 0);
    await expect(
      page.getByRole("button", { name: "トレーニングを開始", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: `test-results/start-home-${width}.png`, fullPage: true });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let starts = 0;
    await page.route("**/api/sessions", async (route) => {
      if (route.request().method() === "POST") {
        starts++;
        await gate;
      }
      await route.fallback();
    });
    try {
      await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
      await expect(page.getByRole("heading", { name: "種目を選択", exact: true })).toBeVisible();
      await expect(floating).toHaveCount(0);
      await page.getByRole("button", { name: /^ベンチプレス/ }).click();
      await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("60");
      await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toBeDisabled();
    } finally {
      release();
    }
    await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await expect.poll(() => state.session?.exercises[0]?.sets.length).toBe(1);
    const sessionId = state.session?.id;
    await navigate(page, "グループ");
    await expect(
      page.getByRole("heading", { name: state.group.name, level: 1, exact: true }),
    ).toBeVisible();
    await expect(floating).toHaveText("RESUME");
    if (width === 390)
      await page.screenshot({ path: "test-results/start-groups.png", fullPage: true });
    await floating.click();
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("60");
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: state.group.name, level: 1, exact: true }),
    ).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("60");
    expect(state.session?.id).toBe(sessionId);
    expect(starts).toBe(1);
    await navigate(page, "ホーム");
    await page.getByRole("button", { name: "トレーニングを再開", exact: true }).click();
    expect(starts).toBe(1);
  });
}

test("入力フォーカスとSheet表示中はフローティング開始を隠し、振り返りへ進める", async ({
  page,
}) => {
  await mockTraining(page);
  const floating = page.getByTestId("floating-training");
  await page.getByText("前回を振り返る", { exact: true }).click();
  await expect(page.getByRole("region", { name: "これまでのトレーニング" })).toBeVisible();
  await navigate(page, "設定");
  await page.getByRole("button", { name: /^表示名/ }).click();
  await page.getByRole("textbox", { name: "表示名", exact: true }).focus();
  await expect(floating).toBeHidden();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(floating).toBeVisible();
  await page.getByRole("button", { name: /^外観/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(floating).toBeHidden();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(floating).toBeVisible();
});

test("未所属のグループタブと通常入力でも開始操作を使い分ける", async ({ page }) => {
  await mockTraining(page);
  await page.route("**/api/groups", (route) => route.fulfill({ json: [] }));
  await page.reload();
  await navigate(page, "グループ");
  await expect(page.getByRole("heading", { name: "グループ一覧", exact: true })).toBeVisible();
  const floating = page.getByTestId("floating-training");
  await expect(floating).toBeVisible();
  await page.getByRole("button", { name: "グループを作成", exact: true }).click();
  await page.getByLabel("グループ名", { exact: true }).focus();
  await expect(floating).toBeHidden();
  await page.getByRole("heading", { name: "グループを作成", exact: true }).click();
  await expect(floating).toBeVisible();
  await floating.click();
  await expect(page.getByRole("heading", { name: "種目を選択", exact: true })).toBeVisible();
});
