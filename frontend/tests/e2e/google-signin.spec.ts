import { type Page, expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

async function googleUser(page: Page, savedName = "") {
  const state = await mockTraining(page);
  state.user.app_metadata = { provider: "google", providers: ["google"] };
  state.user.user_metadata.display_name = savedName;
  Object.assign(state.user.user_metadata, {
    full_name: "Googleの本名",
    avatar_url: "https://example.test/private.jpg",
  });
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        id: state.user.id,
        display_name: savedName || "トレーニー",
      },
    }),
  );
  await page.evaluate((user) => {
    const key = Object.keys(localStorage).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
    );
    if (!key) throw new Error("テスト用セッションがありません");
    const session = JSON.parse(localStorage.getItem(key) || "{}");
    session.user = user;
    localStorage.setItem(key, JSON.stringify(session));
  }, state.user);
  await page.reload();
  return state;
}

for (const width of [320, 390, 430]) {
  test(`Google登録とメールログインを${width}pxで表示できる`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const button = page.getByRole("button", { name: "Googleで続ける" });
    await expect(button).toBeEnabled();
    await expect(page.getByLabel("メールアドレス", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`google-login-${width}.png`),
      fullPage: true,
    });
  });
}

test("基本権限だけでGoogleへ進み、キャンセルからログイン画面へ戻れる", async ({ page }) => {
  let requested: URL | undefined;
  await page.route("**/auth/v1/authorize?**", async (route) => {
    requested = new URL(route.request().url());
    const callback = requested.searchParams.get("redirect_to");
    await route.fulfill({
      status: 302,
      headers: { location: `${callback}#error=access_denied&error_description=PRIVATE` },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Googleで続ける" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("キャンセル");
  expect(requested?.searchParams.get("provider")).toBe("google");
  expect(requested?.searchParams.get("scopes")).toBe("openid email profile");
  expect(requested?.searchParams.get("redirect_to")).toBe("http://127.0.0.1:3100/auth/callback");
  await expect(page).toHaveURL("http://127.0.0.1:3100/auth/callback");
  await expect(page.getByRole("main")).not.toContainText("PRIVATE");
  await page.getByRole("link", { name: "ログイン画面へ戻る" }).click();
  await expect(page.getByRole("button", { name: "Googleで続ける" })).toBeEnabled();
});

test("セッションのない復帰と認証失敗は、外部の戻り先や詳細を使わない", async ({ page }) => {
  await page.goto("/auth/callback?next=https://example.test");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("確認できません");
  await expect(page).toHaveURL("http://127.0.0.1:3100/auth/callback");
  await page.goto("/auth/callback?error=server_error&error_description=PRIVATE");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("完了できません");
  await expect(page.getByRole("main")).not.toContainText("PRIVATE");
});

test("認証からの復帰でセッションを保存し、トークンをURLから消す", async ({ page }) => {
  const state = await googleUser(page, "既存の表示名");
  await page.getByRole("navigation").waitFor();
  const session = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
    );
    const value = JSON.parse(localStorage.getItem(key || "") || "{}");
    localStorage.removeItem(key || "");
    return value;
  });
  const hash = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: "3600",
    token_type: "bearer",
    provider_token: "PRIVATE-PROVIDER-TOKEN",
  });
  await page.goto(`/auth/callback#${hash}`);
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  expect(state.authUpdates).toBe(0);
});

test("初回は本名を使わず表示名を保存し、再ログインでは設定を繰り返さない", async ({
  page,
}, testInfo) => {
  const state = await googleUser(page);
  const name = page.getByLabel("表示名", { exact: true });
  await expect(name).toHaveValue("");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText("Googleの本名");
  await name.fill("   ");
  await page.getByRole("button", { name: "はじめる", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("1〜20文字");
  expect(state.authUpdates).toBe(0);
  await name.fill("合トレ仲間");
  await page.screenshot({ path: testInfo.outputPath("google-nickname.png"), fullPage: true });
  await page.getByRole("button", { name: "はじめる", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  expect(state.user.user_metadata.display_name).toBe("合トレ仲間");
  expect(state.syncs).toBe(1);
  await page.reload();
  await expect(page.getByRole("navigation")).toBeVisible();
  await navigate(page, "設定");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page.getByLabel("メールアドレス", { exact: true }).fill("ui@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("ui-test-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  expect(state.authUpdates).toBe(1);
});

test("表示名のAuth保存失敗は入力を保持し、同期失敗はAuthを再更新せず再試行する", async ({
  page,
}) => {
  const state = await googleUser(page);
  await page.getByLabel("表示名", { exact: true }).fill("保持する名前");
  state.failAuth = true;
  await page.getByRole("button", { name: "はじめる", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("変更できません");
  await expect(page.getByLabel("表示名", { exact: true })).toHaveValue("保持する名前");
  expect(state.syncs).toBe(0);
  state.failAuth = false;
  state.failSync = true;
  await page.getByRole("button", { name: "はじめる", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("保存済み");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  const updates = state.authUpdates;
  state.failSync = false;
  await page.getByRole("button", { name: "反映を再試行" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  expect(state.authUpdates).toBe(updates);
});

test("Authに名前のない既存利用者はDBの名前を保持し、取得失敗から再試行できる", async ({ page }) => {
  await googleUser(page);
  let fail = true;
  await page.route("**/api/me", (route) =>
    route.fulfill(
      fail
        ? { status: 503, json: { detail: "PRIVATE" } }
        : { json: { display_name: "以前の名前" } },
    ),
  );
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("確認できません");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByLabel("表示名", { exact: true })).toHaveValue("以前の名前");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page.getByRole("button", { name: "Googleで続ける" })).toBeVisible();
});

test("認証の確認が止まっても待機を終え、再試行の導線を表示する", async ({ page }) => {
  await page.clock.install();
  await page.route("**/auth/v1/user", () => {});
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: "00000000-0000-0000-0000-000000000001", exp })).toString("base64url")}.test`;
  await page.goto(
    `/auth/callback#access_token=${token}&refresh_token=test&expires_in=3600&token_type=bearer`,
  );
  await expect(page.getByRole("status", { name: "ログインを確認中" })).toBeVisible();
  await page.clock.fastForward(16_000);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("確認できません");
  await expect(page.getByRole("link", { name: "ログイン画面へ戻る" })).toBeVisible();
  await expect(page).toHaveURL("http://127.0.0.1:3100/auth/callback");
});
