import { type Page, expect, test } from "../fixtures";
import { createTestUser, localAuth, testPassword } from "../local-auth";
import { startTraining } from "../mock-training";
import { backendUrl } from "../test-server";

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
    await expect
      .poll(async () => {
        const response = await pageA.request.get(`${backendUrl}/api/sessions/active`, {
          headers: authA,
        });
        return (await response.json())?.exercises?.[0]?.sets?.length ?? 0;
      })
      .toBe(1);
    const active = await (
      await pageA.request.get(`${backendUrl}/api/sessions/active`, { headers: authA })
    ).json();
    await pageA.getByRole("spinbutton", { name: "重量", exact: true }).fill("62.5");
    const before = await pageA.getByRole("spinbutton", { name: "重量", exact: true }).boundingBox();
    await pageB.bringToFront();
    await pageB.reload();
    const card = pageB.locator(`[data-workout-id="${active.id}"]`);
    await expect(card.locator(".inline-stamp-choice")).toHaveCount(6);
    await pageB.screenshot({ path: "test-results/stamps-direct.png", fullPage: true });
    const endpoint = `/api/groups/${group.id}/workouts/${active.id}/stamps/praise`;
    let fail = true;
    await pageB.route(`**${endpoint}`, (route) =>
      fail
        ? route.fulfill({ status: 503, json: { detail: "送れませんでした" } })
        : route.continue(),
    );
    await card.getByRole("button", { name: "👏スタンプ", exact: true }).click();
    await expect
      .poll(() =>
        pageB.evaluate(() =>
          Object.keys(localStorage).some(
            (key) =>
              key.startsWith("egotore:stamp-job:v1:") &&
              JSON.parse(localStorage.getItem(key) ?? "null")?.state === "failed",
          ),
        ),
      )
      .toBe(true);
    await expect(card.locator(".inline-stamp-error")).toHaveCount(0);
    await expect(pageB.getByRole("button", { name: /スタンプの未送信を確認/ })).toHaveCount(0);
    fail = false;
    await pageB.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect
      .poll(async () => {
        const response = await pageA.request.get(
          `${backendUrl}/api/stamps/inbox?workout_id=${active.id}`,
          { headers: authA },
        );
        const inbox = await response.json();
        return [inbox.total, inbox.unread];
      })
      .toEqual([1, 1]);
    await pageA.bringToFront();
    await expect(pageA.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("62.5");
    expect(
      (await pageA.getByRole("spinbutton", { name: "重量", exact: true }).boundingBox())?.y,
    ).toBe(before?.y);
    await pageA.screenshot({ path: "test-results/stamps-input-preserved.png", fullPage: true });
    await pageA.getByRole("button", { name: "トレーニング終了", exact: true }).click();
    await pageA
      .getByRole("dialog", { name: "トレーニング終了", exact: true })
      .getByRole("button", { name: "終了する", exact: true })
      .click();
    const receipt = pageA.getByRole("region", { name: "今回届いたスタンプ", exact: true });
    await expect(
      receipt.getByRole("button", { name: "えらい 1件の詳細", exact: true }),
    ).toBeVisible();
    await pageA.screenshot({ path: "test-results/stamps-result.png", fullPage: true });
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
    await card.getByRole("button", { name: "👏スタンプ", exact: true }).click();
    await expect
      .poll(async () => {
        const response = await pageA.request.get(
          `${backendUrl}/api/stamps/inbox?workout_id=${active.id}`,
          { headers: authA },
        );
        return (await response.json()).total;
      })
      .toBe(0);
    for (const kind of ["fire", "muscle", "eyes"])
      expect(
        (
          await pageB.request.put(
            `${backendUrl}/api/groups/${group.id}/workouts/${active.id}/stamps/${kind}`,
            { headers: authB },
          )
        ).ok(),
      ).toBe(true);
    for (const width of [320, 390, 430]) {
      await pageA.setViewportSize({ width, height: 844 });
      expect(await pageA.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await receipt.getByRole("button", { name: /届いたスタンプの詳細/ }).click();
    await expect(inbox).toContainText("ミオ");
    await expect(inbox).toContainText("3個");
  } finally {
    await a.close();
    await b.close();
  }
});
