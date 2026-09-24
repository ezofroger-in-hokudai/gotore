import { expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

for (const width of [320, 390, 430]) {
  test(`${width}pxで受信スタンプを常時表示し入力位置を保って詳細と既読を確認する`, async ({
    page,
  }) => {
    await page.clock.install();
    await page.setViewportSize({ width, height: 720 });
    await mockTraining(page);
    let received = false;
    let read = false;
    let failed = false;
    const kinds = ["encourage", "push", "bad", "amazing", "praise", "tengu"];
    await page.route("**/api/stamps/inbox?*", (route) => {
      if (failed) return route.fulfill({ status: 503, json: { detail: "取得できません" } });
      return route.fulfill({
        json: {
          counts: received
            ? { encourage: 55, push: 2, bad: 1, amazing: 3, praise: 4, tengu: 1 }
            : {},
          total: received ? 66 : 0,
          people: received ? 55 : 0,
          unread: received && !read ? 6 : 0,
          can_send: false,
          mine: [],
          has_more: false,
          items: received
            ? kinds.map((kind, i) => ({
                id: `reaction-${i}`,
                workout_id: "workout",
                group_id: "group",
                group_name: "朝トレ部",
                sender_id: `sender-${i}`,
                display_name: `仲間${i + 1}`,
                kind,
                read,
                announced: false,
                performed_on: "2026-09-18",
                exercise: "ベンチプレス",
              }))
            : [],
        },
      });
    });
    await page.route("**/api/stamps/seen", (route) => {
      if (route.request().postDataJSON().read) read = true;
      return route.fulfill({ status: 204 });
    });
    await startTraining(page);
    for (let i = 0; i < 6; i++) {
      await page.getByRole("button", { name: "セットを追加", exact: true }).click();
      await expect(page.getByRole("heading", { name: `SET ${i + 2}`, exact: true })).toBeVisible();
    }
    await page.getByRole("region", { name: "全セットの比較", exact: true }).evaluate((element) => {
      element.scrollTop = 0;
    });
    const input = page.getByRole("spinbutton", { name: "重量", exact: true });
    await input.fill("62.5");
    const y = (await input.boundingBox())?.y;
    const receipt = page.getByRole("region", { name: "記録中のスタンプ", exact: true });
    await expect(receipt).toContainText("スタンプなし");
    received = true;
    // ポーリング周期は維持し、ブラウザ内の時間だけ進める。
    await page.clock.fastForward(10_000);
    await expect(
      receipt.getByRole("button", { name: "がんばれ 55件の詳細", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    expect((await input.boundingBox())?.y).toBe(y);
    await expect(input).toHaveValue("62.5");
    await expect(receipt.locator(".stamp-live-list button")).toHaveCount(6);
    const more = receipt.getByRole("button", { name: /届いたスタンプの詳細/ });
    await expect(more).toHaveAccessibleName("届いたスタンプの詳細・未読6件");
    await expect(more).toBeInViewport({ ratio: 1 });
    const size = await more.boundingBox();
    expect(size?.width).toBeGreaterThanOrEqual(48);
    expect(size?.height).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(720);
    await page.screenshot({
      path: `test-results/stamp-receipt-inline-${width}.png`,
      fullPage: true,
    });
    await page.clock.fastForward(5_000);
    await expect(receipt.locator(".stamp-live-new")).toHaveCount(0);
    await expect(
      receipt.getByRole("button", { name: "がんばれ 55件の詳細", exact: true }),
    ).toBeVisible();
    await more.click();
    const inbox = page.getByRole("dialog", { name: "今回届いたスタンプ", exact: true });
    await expect(inbox).toContainText("仲間1");
    await expect(inbox).toContainText("朝トレ部");
    await expect.poll(() => read).toBe(true);
    await page.screenshot({
      path: `test-results/stamp-receipt-details-${width}.png`,
      fullPage: true,
    });
    await inbox.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(more).toHaveAccessibleName("届いたスタンプの詳細");
    expect((await input.boundingBox())?.y).toBe(y);
    failed = true;
    await page.clock.fastForward(10_000);
    await expect(
      receipt.getByRole("button", { name: "スタンプ取得を再試行", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    expect((await input.boundingBox())?.y).toBe(y);
    failed = false;
    await receipt.getByRole("button", { name: "スタンプ取得を再試行", exact: true }).click();
    await expect(
      receipt.getByRole("button", { name: "がんばれ 55件の詳細", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "セットを追加", exact: true }).click();
    const finish = page.getByRole("button", { name: "トレーニング終了", exact: true });
    await expect(finish).toContainText("トレーニング終了");
    if (width === 390) {
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
      });
      await page.screenshot({ path: "test-results/stamp-receipt-dark.png", fullPage: true });
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "light";
      });
    }
    await finish.click();
    await page
      .getByRole("dialog", { name: "トレーニング終了", exact: true })
      .getByRole("button", { name: "今日のトレーニング終了", exact: true })
      .click();
    const result = page.getByRole("region", { name: "トレーニング結果", exact: true });
    await expect(result.locator(".stamp-live-list button")).toHaveCount(6);
    await page.screenshot({
      path: `test-results/stamp-receipt-result-${width}.png`,
      fullPage: true,
    });
    await result.getByRole("button", { name: "届いたスタンプの詳細", exact: true }).click();
    await expect(inbox).toContainText("仲間1");
    await inbox.getByRole("button", { name: "閉じる", exact: true }).click();
    await result.getByRole("button", { name: "ホーム", exact: true }).click();
    const homeSummary = page.locator(".stamp-inbox-summary:visible");
    await expect(homeSummary.locator(".stamp-live-list button")).toHaveCount(6);
    await page.screenshot({ path: `test-results/stamp-receipt-home-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "画面テスト部の詳細", exact: true }).click();
    await expect(page.locator(".stamp-inbox-summary:visible .stamp-live-list button")).toHaveCount(
      6,
    );
    await page.screenshot({
      path: `test-results/stamp-receipt-group-${width}.png`,
      fullPage: true,
    });
  });
}
