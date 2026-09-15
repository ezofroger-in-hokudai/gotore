import { type Page, expect, test } from "@playwright/test";
import { createTestUser, localAuth, testPassword } from "./local-auth";
import { navigate, startTraining } from "./mock-training";

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
    const groupResponse = await pageA.request.post("http://127.0.0.1:8100/api/groups", {
      headers: authA,
      data: { name: "北大トレーニング部" },
    });
    expect(groupResponse.status()).toBe(201);
    const group = await groupResponse.json();
    expect(
      (
        await pageB.request.post("http://127.0.0.1:8100/api/groups/join", {
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
    await pageA.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await expect(pageA.getByText("保存しました", { exact: true })).toBeVisible();
    const active = await (
      await pageA.request.get("http://127.0.0.1:8100/api/sessions/active", { headers: authA })
    ).json();
    await pageA.getByRole("spinbutton", { name: "重量", exact: true }).fill("62.5");
    const before = await pageA.getByRole("spinbutton", { name: "重量", exact: true }).boundingBox();
    await pageB.bringToFront();
    await pageB.reload();
    await pageB.getByRole("button", { name: "タクミの記録のスタンプを開く", exact: true }).click();
    const panel = pageB.getByRole("dialog", { name: "スタンプ", exact: true });
    await expect(panel.locator(".stamp-picker button")).toHaveCount(4);
    await pageB.screenshot({ path: "test-results/stamps-picker.png", fullPage: true });
    const endpoint = `/api/groups/${group.id}/workouts/${active.id}/stamps/clap`;
    let fail = true;
    await pageB.route(`**${endpoint}`, (route) =>
      fail
        ? route.fulfill({ status: 503, json: { detail: "送れませんでした" } })
        : route.continue(),
    );
    await panel.getByRole("button", { name: "👏 を送る", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("送れませんでした");
    fail = false;
    await panel.getByRole("button", { name: "再試行", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await pageA.bringToFront();
    const receipt = pageA.getByRole("region", { name: "記録中のスタンプ", exact: true });
    await expect(receipt).toContainText("ミオから", { timeout: 20000 });
    await expect(receipt).toContainText("未読 1");
    await expect(pageA.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("62.5");
    expect(
      (await pageA.getByRole("spinbutton", { name: "重量", exact: true }).boundingBox())?.y,
    ).toBe(before?.y);
    await pageA.screenshot({ path: "test-results/stamps-arrival.png", fullPage: true });
    await expect(receipt).not.toContainText("ミオから", { timeout: 8000 });
    await receipt.getByRole("button").click();
    const inbox = pageA.getByRole("dialog", { name: "今回届いたスタンプ", exact: true });
    await expect(inbox).toContainText("ミオ");
    await pageA.screenshot({ path: "test-results/stamps-inbox.png", fullPage: true });
    await expect
      .poll(
        async () =>
          (
            await (
              await pageA.request.get(
                `http://127.0.0.1:8100/api/stamps/inbox?workout_id=${active.id}`,
                { headers: authA },
              )
            ).json()
          ).unread,
      )
      .toBe(0);
    await inbox.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(receipt).not.toContainText("未読");
    await pageB.getByRole("button", { name: "タクミの記録のスタンプを開く", exact: true }).click();
    await expect(
      panel.getByRole("button", { name: "選んだスタンプを取り消す", exact: true }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "選んだスタンプを取り消す", exact: true }).click();
    await pageA.bringToFront();
    await expect(receipt).toContainText("0個", { timeout: 20000 });
    await pageA.setViewportSize({ width: 320, height: 720 });
    for (const kind of ["fire", "muscle", "eyes"])
      expect(
        (
          await pageB.request.put(
            `http://127.0.0.1:8100/api/groups/${group.id}/workouts/${active.id}/stamps/${kind}`,
            { headers: authB },
          )
        ).ok(),
      ).toBe(true);
    await expect(receipt).toContainText("ほか2件", { timeout: 20000 });
    expect(await pageA.evaluate(() => document.documentElement.scrollHeight)).toBe(720);
    await expect(
      pageA.getByRole("button", { name: "トレーニング終了", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await pageA.screenshot({ path: "test-results/stamps-compact.png", fullPage: true });
    await pageA.setViewportSize({ width: 390, height: 844 });
    await receipt.getByRole("button").click();
    await expect(inbox.locator(".stamp-inbox-row")).toHaveCount(3);
    await inbox.getByRole("button", { name: "閉じる", exact: true }).click();
    await pageA.getByRole("button", { name: "トレーニング終了", exact: true }).click();
    await pageA
      .getByRole("dialog", { name: "トレーニング終了", exact: true })
      .getByRole("button", { name: "終了する", exact: true })
      .click();
    await expect(
      pageA.getByRole("region", { name: "今回届いたスタンプ", exact: true }),
    ).toContainText("3個");
    await pageA.screenshot({ path: "test-results/stamps-result.png", fullPage: true });
    for (const width of [320, 390, 430]) {
      await pageA.setViewportSize({ width, height: 844 });
      expect(await pageA.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await pageA.reload();
    await pageA.getByRole("button", { name: "届いたスタンプ", exact: true }).click();
    await expect(pageA.getByRole("dialog", { name: "届いたスタンプ", exact: true })).toContainText(
      "3個",
    );
  } finally {
    await a.close();
    await b.close();
  }
});
