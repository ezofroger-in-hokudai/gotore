import { type Page, expect, test } from "@playwright/test";
import { createTestUser, localAuth, testPassword } from "./local-auth";
import { navigate, startTraining } from "./mock-training";
import { backendUrl } from "./test-server";

async function login(page: Page, name: string, email: string) {
  await createTestUser(name, email);
  const { data, error } = await localAuth().publicAuth.signInWithPassword({
    email,
    password: testPassword,
  });
  if (error || !data.session) throw new Error("テストの認証に失敗しました");
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "スキップ", exact: true }).click();
  return { Authorization: `Bearer ${data.session.access_token}` };
}

test("2人でスタンプを送信し、記録中の入力保持・未読・取消・再訪・終了後を確認する", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const b = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  const run = crypto.randomUUID();
  try {
    const authA = await login(pageA, "タクミ", `stamp-${run}-a@example.test`);
    const authB = await login(pageB, "ミオ", `stamp-${run}-b@example.test`);
    const groupResponse = await pageA.request.post(`${backendUrl}/api/groups`, {
      headers: authA,
      data: { name: "北大トレーニング部" },
    });
    expect(groupResponse.status()).toBe(201);
    const group = await groupResponse.json();
    expect(
      (
        await pageB.request.post(`${backendUrl}/api/groups/join`, {
          headers: authB,
          data: { invite_code: group.invite_code },
        })
      ).ok(),
    ).toBe(true);
    await pageA.bringToFront();
    await pageA.reload();
    await startTraining(pageA);
    await pageA.getByRole("spinbutton", { name: "重量", exact: true }).fill("60");
    await pageA.getByRole("spinbutton", { name: "回数", exact: true }).fill("10");
    await pageA.getByRole("button", { name: "セットを追加", exact: true }).click();
    await expect(pageA.getByText("保存しました", { exact: true })).toBeVisible();
    const active = await (
      await pageA.request.get(`${backendUrl}/api/sessions/active`, { headers: authA })
    ).json();
    await pageA.getByRole("spinbutton", { name: "重量", exact: true }).fill("62.5");
    const before = await pageA.getByRole("spinbutton", { name: "重量", exact: true }).boundingBox();
    await pageB.bringToFront();
    await pageB.reload();
    await pageB.getByRole("button", { name: "タクミの記録にスタンプを追加", exact: true }).click();
    const panel = pageB.getByRole("dialog", { name: "スタンプ", exact: true });
    await expect(panel.locator(".inline-stamp-choice")).toHaveCount(6);
    await pageB.screenshot({ path: "test-results/stamps-picker.png", fullPage: true });
    const endpoint = `/api/groups/${group.id}/workouts/${active.id}/stamps/praise`;
    let fail = true;
    await pageB.route(`**${endpoint}`, (route) =>
      fail
        ? route.fulfill({ status: 503, json: { detail: "送れませんでした" } })
        : route.continue(),
    );
    await panel.getByRole("button", { name: "えらい", exact: true }).click();
    await expect(pageB.locator(".inline-stamp-error")).toContainText("送れませんでした");
    fail = false;
    await pageB
      .locator(".inline-stamp-error")
      .getByRole("button", { name: "再試行", exact: true })
      .click();
    await expect(panel).toHaveCount(0);
    await pageA.bringToFront();
    const receipt = pageA.getByRole("region", { name: "記録中のスタンプ", exact: true });
    await expect(
      receipt.getByRole("button", { name: "えらい 1件の詳細", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      receipt.getByRole("button", { name: /届いたスタンプの詳細/ }),
    ).toHaveAccessibleName("届いたスタンプの詳細・未読1件");
    await expect(pageA.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("62.5");
    expect(
      (await pageA.getByRole("spinbutton", { name: "重量", exact: true }).boundingBox())?.y,
    ).toBe(before?.y);
    await pageA.screenshot({ path: "test-results/stamps-arrival.png", fullPage: true });
    await expect(receipt.locator(".stamp-live-new")).toHaveCount(0, { timeout: 8000 });
    await receipt.getByRole("button", { name: /届いたスタンプの詳細/ }).click();
    const inbox = pageA.getByRole("dialog", { name: "今回届いたスタンプ", exact: true });
    await expect(inbox).toContainText("ミオ");
    await pageA.screenshot({ path: "test-results/stamps-inbox.png", fullPage: true });
    await expect
      .poll(
        async () =>
          (
            await (
              await pageA.request.get(`${backendUrl}/api/stamps/inbox?workout_id=${active.id}`, {
                headers: authA,
              })
            ).json()
          ).unread,
      )
      .toBe(0);
    await inbox.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(
      receipt.getByRole("button", { name: /届いたスタンプの詳細/ }),
    ).toHaveAccessibleName("届いたスタンプの詳細");
    await pageB.bringToFront();
    await pageB.getByRole("button", { name: "えらい 1件", exact: true }).click();
    await pageA.bringToFront();
    await expect(receipt).toContainText("スタンプなし", { timeout: 20000 });
    await pageA.setViewportSize({ width: 320, height: 720 });
    for (const kind of ["fire", "muscle", "eyes"])
      expect(
        (
          await pageB.request.put(
            `${backendUrl}/api/groups/${group.id}/workouts/${active.id}/stamps/${kind}`,
            { headers: authB },
          )
        ).ok(),
      ).toBe(true);
    await expect(receipt.locator(".stamp-live-list button")).toHaveCount(3, { timeout: 20000 });
    expect(await pageA.evaluate(() => document.documentElement.scrollHeight)).toBe(720);
    await expect(
      pageA.getByRole("button", { name: "トレーニング終了", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await pageA.screenshot({ path: "test-results/stamps-compact.png", fullPage: true });
    await pageA.setViewportSize({ width: 390, height: 844 });
    await receipt.getByRole("button", { name: /届いたスタンプの詳細/ }).click();
    await expect(inbox.locator(".stamp-inbox-row")).toHaveCount(3);
    await inbox.getByRole("button", { name: "閉じる", exact: true }).click();
    await pageA.getByRole("button", { name: "トレーニング終了", exact: true }).click();
    await pageA
      .getByRole("dialog", { name: "トレーニング終了", exact: true })
      .getByRole("button", { name: "終了する", exact: true })
      .click();
    await expect(
      pageA
        .getByRole("region", { name: "今回届いたスタンプ", exact: true })
        .locator(".stamp-live-list button"),
    ).toHaveCount(3);
    await pageA.screenshot({ path: "test-results/stamps-result.png", fullPage: true });
    for (const width of [320, 390, 430]) {
      await pageA.setViewportSize({ width, height: 844 });
      expect(await pageA.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await pageA.reload();
    await expect(pageA.getByRole("button", { name: "届いたスタンプ", exact: true })).toHaveCount(0);
    await pageA.locator(".community-card").first().click();
    await pageA.getByRole("button", { name: "届いたスタンプ", exact: true }).click();
    await expect(pageA.getByRole("dialog", { name: "届いたスタンプ", exact: true })).toContainText(
      "3個",
    );
  } finally {
    await a.close();
    await b.close();
  }
});
