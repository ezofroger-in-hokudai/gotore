import { expect, test } from "@playwright/test";
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
    await expect(floating.locator(".floating-training-elapsed")).toHaveText("12分");
    const floatingBox = await floating.boundingBox();
    expect(floatingBox?.width).toBe(112);
    expect(floatingBox?.height).toBe(52);
    if (width === 390)
      await page.screenshot({ path: "test-results/session-elapsed-home-390.png", fullPage: true });
    await floating.click();
    const header = page.locator(".session-header");
    await expect(header.locator(".session-elapsed")).toHaveText("12分");
    const identityBox = await header.locator(".session-identity").boundingBox();
    const finishBox = await header.getByRole("button", { name: "トレーニング終了" }).boundingBox();
    expect((identityBox?.x ?? 0) + (identityBox?.width ?? 0)).toBeLessThanOrEqual(
      finishBox?.x ?? 0,
    );
    await page.getByRole("button", { name: /^ベンチプレス/ }).click();
    await expect(header.locator(".session-elapsed")).toHaveText("12分");
    if (width === 320) {
      await page.addStyleTag({ content: "html { font-size: 200%; }" });
      const enlargedIdentity = await header.locator(".session-identity").boundingBox();
      const enlargedFinish = await header
        .getByRole("button", { name: "トレーニング終了" })
        .boundingBox();
      expect((enlargedIdentity?.x ?? 0) + (enlargedIdentity?.width ?? 0)).toBeLessThanOrEqual(
        enlargedFinish?.x ?? 0,
      );
    }
    if (width === 390)
      await page.screenshot({
        path: "test-results/session-elapsed-record-390.png",
        fullPage: true,
      });
    await navigate(page, "ホーム");
    await expect(floating.locator(".floating-training-elapsed")).toHaveText("12分");
    if (width === 390) {
      await floating.click();
      await page.getByRole("button", { name: "トレーニング終了" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "終了する" }).click();
      await expect(page.getByRole("region", { name: "トレーニング結果" })).toBeVisible();
      await page
        .getByRole("region", { name: "トレーニング結果" })
        .getByRole("button", { name: "ホーム" })
        .click();
      await expect(floating).toHaveText("START");
      await expect(floating.locator(".floating-training-elapsed")).toHaveCount(0);
    }
  });
}
