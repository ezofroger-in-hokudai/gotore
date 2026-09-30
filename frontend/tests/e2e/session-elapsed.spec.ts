import { expect, test } from "./fixtures";
import { mockTraining, navigate } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`${width}pxで再開ボタンと記録画面に同じ経過時間を表示する`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const state = await mockTraining(page);
    const startedAt = new Date(Date.now() - 12 * 60_000).toISOString();
    state.session = {
      id: "elapsed-session",
      user_id: state.user.id,
      display_name: state.user.user_metadata.display_name,
      group_id: null,
      shared_group_ids: [state.group.id],
      performed_on: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()),
      exercises: [],
      created_at: startedAt,
      started_at: startedAt,
      ended_at: null,
      revision: 1,
    };
    await page.reload();
    const floating = page.getByTestId("floating-training");
    await expect(floating.locator(".floating-training-elapsed")).toHaveText("0:12");
    const floatingBox = await floating.boundingBox();
    expect(floatingBox?.width).toBe(72);
    expect(floatingBox?.height).toBe(80);
    if (width === 390) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: "test-results/session-elapsed-home-390.png", fullPage: true });
    }
    await floating.click();
    const header = page.locator(".session-header");
    await expect(header.locator(".session-elapsed")).toHaveText("0:12");
    const logoBox = await header.locator(".session-wordmark").boundingBox();
    expect(logoBox?.width).toBeGreaterThan(100);
    const elapsedBox = await header.locator(".session-elapsed").boundingBox();
    const finishBox = await header.getByRole("button", { name: "トレーニング終了" }).boundingBox();
    expect((logoBox?.x ?? 0) + (logoBox?.width ?? 0)).toBeLessThanOrEqual(elapsedBox?.x ?? 0);
    expect((elapsedBox?.x ?? 0) + (elapsedBox?.width ?? 0)).toBeLessThanOrEqual(finishBox?.x ?? 0);
    await page.getByRole("button", { name: /^ベンチプレス/ }).click();
    await expect(header.locator(".session-elapsed")).toHaveText("0:12");
    if (width === 320) {
      await page.addStyleTag({ content: "html { font-size: 200%; }" });
      const enlargedElapsed = await header.locator(".session-elapsed").boundingBox();
      const enlargedFinish = await header
        .getByRole("button", { name: "トレーニング終了" })
        .boundingBox();
      expect((enlargedElapsed?.x ?? 0) + (enlargedElapsed?.width ?? 0)).toBeLessThanOrEqual(
        enlargedFinish?.x ?? 0,
      );
    }
    if (width === 390) {
      await page.waitForTimeout(300);
      await page.screenshot({
        path: "test-results/session-elapsed-record-390.png",
        fullPage: true,
      });
    }
    await navigate(page, "ホーム");
    await expect(floating.locator(".floating-training-elapsed")).toHaveText("0:12");
    if (width === 390) {
      await floating.click();
      await page.getByRole("button", { name: "トレーニング終了" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "終了する" }).click();
      await expect(page.getByRole("region", { name: "トレーニング結果" })).toBeVisible();
      await page
        .getByRole("region", { name: "トレーニング結果" })
        .getByRole("button", { name: "ホーム" })
        .click();
      await expect(floating.locator(".floating-training-action")).toHaveText("START");
      await expect(floating.locator(".floating-training-elapsed")).toHaveText("▶");
    }
  });
}

test("開始時刻から0:10を表示し、1分後と再読込後も同じ時計で進む", async ({ page }) => {
  await page.clock.install({ time: new Date() });
  const state = await mockTraining(page);
  const startedAt = new Date(Date.now() - 10 * 60_000 - 5000).toISOString();
  state.session = {
    id: "running-clock-session",
    user_id: state.user.id,
    display_name: state.user.user_metadata.display_name,
    group_id: null,
    shared_group_ids: [state.group.id],
    performed_on: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()),
    exercises: [],
    created_at: startedAt,
    started_at: startedAt,
    ended_at: null,
    revision: 1,
  };
  await page.reload();
  const reading = page.getByTestId("floating-training").locator(".floating-training-elapsed");
  await expect(reading).toHaveText("0:10");
  await page.clock.fastForward(60_000);
  await expect(reading).toHaveText("0:11");
  await page.reload();
  await expect(reading).toHaveText("0:11");
});
