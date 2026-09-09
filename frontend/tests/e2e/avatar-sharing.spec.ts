import { type Page, expect, test } from "@playwright/test";
import { createTestUser, localAuth, testPassword } from "./local-auth";
import { navigate } from "./mock-training";

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

test("実画像は設定で保存後に仲間へ表示され、退出後と未認証の取得を拒否する", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const run = crypto.randomUUID();
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const b = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    const authA = await login(pageA, "画像テストA", `gotore-avatar-${run}-a@example.test`);
    const authB = await login(pageB, "画像テストB", `gotore-avatar-${run}-b@example.test`);
    const groupResponse = await pageA.request.post("http://127.0.0.1:8100/api/groups", {
      headers: authA,
      data: { name: "画像の共有テスト" },
    });
    expect(groupResponse.status()).toBe(201);
    const group = await groupResponse.json();
    const join = await pageB.request.post("http://127.0.0.1:8100/api/groups/join", {
      headers: authB,
      data: { invite_code: group.invite_code },
    });
    expect(join.ok()).toBe(true);
    const started = await pageA.request.post("http://127.0.0.1:8100/api/sessions", {
      headers: authA,
      data: { id: crypto.randomUUID() },
    });
    const session = await started.json();
    const save = await pageA.request.patch(`http://127.0.0.1:8100/api/sessions/${session.id}`, {
      headers: authA,
      data: {
        expected_revision: session.revision,
        exercises: [{ name: "ベンチプレス", sets: [{ weight: 80, reps: 8 }] }],
      },
    });
    expect(save.ok()).toBe(true);
    await pageA.bringToFront();
    await navigate(pageA, "設定");
    await pageA.getByRole("button", { name: /^プロフィール画像/ }).click();
    const dialog = pageA.getByRole("dialog");
    await dialog.getByLabel("写真を選ぶ").setInputFiles("tests/fixtures/avatar.png");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("保存しました。");
    await pageA.screenshot({ path: "test-results/avatar-settings.png", fullPage: true });
    await pageB.bringToFront();
    await pageB.reload();
    const record = pageB.getByRole("article");
    await expect(record.locator(".person-avatar img")).toBeVisible();
    await expect(record.locator(".avatar-live-dot")).toBeVisible();
    const imagePath = `http://127.0.0.1:8100/api/profiles/${group.owner_id}/avatar`;
    expect((await pageB.request.get(imagePath, { headers: authB })).status()).toBe(200);
    expect((await pageB.request.get(imagePath)).status()).toBe(401);
    const detail = await (
      await pageB.request.get(`http://127.0.0.1:8100/api/groups/${group.id}`, { headers: authB })
    ).json();
    const self = detail.members.find((member: { id: string }) => member.id !== group.owner_id);
    const left = await pageB.request.delete(
      `http://127.0.0.1:8100/api/groups/${group.id}/membership?${new URLSearchParams({ expected_joined_at: self.joined_at })}`,
      { headers: authB },
    );
    expect(left.status()).toBe(204);
    expect((await pageB.request.get(imagePath, { headers: authB })).status()).toBe(404);
    await pageB.reload();
    await expect(pageB.getByRole("article")).toHaveCount(0);
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
  }
});
