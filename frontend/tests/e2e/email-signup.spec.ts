import { type Page, expect, test } from "@playwright/test";
import { localAuth, testPassword } from "./local-auth";
import { mockTraining } from "./mock-training";

async function openSignup(page: Page, email = "signup@example.test") {
  await page.goto("/");
  await page.getByRole("button", { name: "新規登録", exact: true }).click();
  await page.getByLabel("表示名", { exact: true }).fill("  登録テスト  ");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
}

test("登録は確認待ちとなり、本人名と正しい確認URLを送り、パスワードを残さない", async ({
  page,
}) => {
  let payload: Record<string, unknown> = {};
  let redirect = "";
  let sends = 0;
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/v1/signup?*", async (route) => {
    sends++;
    payload = route.request().postDataJSON();
    redirect = new URL(route.request().url()).searchParams.get("redirect_to") ?? "";
    await waiting;
    await route.fulfill({
      json: {
        id: crypto.randomUUID(),
        identities: [],
        email: "signup@example.test",
      },
    });
  });
  await openSignup(page);
  await page.getByRole("button", { name: "確認メールを送る", exact: true }).click();
  await expect(page.getByRole("button", { name: "確認中…", exact: true })).toBeDisabled();
  await expect.poll(() => sends).toBe(1);
  await page
    .locator("form")
    .evaluate((form) =>
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
  expect(sends).toBe(1);
  release();
  await expect(page.getByRole("heading", { name: "確認メールをご確認ください" })).toBeVisible();
  expect(payload.data).toEqual({ display_name: "登録テスト" });
  expect(redirect).toBe("http://127.0.0.1:3100/auth/confirm");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByLabel("パスワード", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain(testPassword);
  await expect(page.getByRole("button", { name: /再送まで/ })).toBeDisabled();
});

test("確認前は実Authでログインできず、画面で確認待ちへ案内する", async ({ page }) => {
  const { publicAuth } = localAuth();
  const email = `gotore-unconfirmed-${crypto.randomUUID()}@example.test`;
  const result = await publicAuth.signUp({ email, password: testPassword });
  expect(result.error).toBeNull();
  expect(result.data.session).toBeNull();
  const login = await publicAuth.signInWithPassword({
    email,
    password: testPassword,
  });
  expect(login.error?.code).toBe("email_not_confirmed");
  expect(login.data.session).toBeNull();
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("heading", { name: "確認メールをご確認ください" })).toBeVisible();
});

test("入力不正と送信失敗では確認待ちへ進まず、入力を保持して再試行できる", async ({ page }) => {
  let sends = 0;
  await page.route("**/auth/v1/signup?*", (route) => {
    sends++;
    return route.fulfill({
      status: 500,
      json: { code: "unexpected_failure", msg: "private-diagnostic" },
    });
  });
  await openSignup(page);
  await page.getByLabel("表示名", { exact: true }).fill(" ");
  await page.getByRole("button", { name: "確認メールを送る", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("1〜20文字");
  expect(sends).toBe(0);
  await page.getByLabel("表示名", { exact: true }).fill("本人");
  await page.getByRole("button", { name: "確認メールを送る", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("再試行");
  await expect(page.getByRole("main").getByRole("alert")).not.toContainText("private-diagnostic");
  await expect(page.getByLabel("パスワード", { exact: true })).toHaveValue(testPassword);
  await expect(page.getByRole("button", { name: "確認メールを送る", exact: true })).toBeEnabled();
});

test("未確認ログインから再送でき、二重送信と送信制限中の再試行を防ぐ", async ({ page }) => {
  await page.clock.install();
  await page.route("**/auth/v1/token?*", (route) =>
    route.fulfill({
      status: 400,
      headers: {
        "x-supabase-api-version": "2024-01-01",
        "access-control-expose-headers": "x-supabase-api-version",
      },
      json: { code: "email_not_confirmed", msg: "Email not confirmed" },
    }),
  );
  let sends = 0;
  let payload: Record<string, unknown> = {};
  await page.route("**/auth/v1/resend?*", async (route) => {
    sends++;
    payload = route.request().postDataJSON();
    await route.fulfill(
      sends === 1 ? { status: 429, json: { code: "over_email_send_rate_limit" } } : { json: {} },
    );
  });
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill("pending@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("heading", { name: "確認メールをご確認ください" })).toBeVisible();
  await page.getByRole("button", { name: "確認メールを再送する", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("時間");
  await expect(page.getByRole("button", { name: /再送まで/ })).toBeDisabled();
  expect(sends).toBe(1);
  expect(payload).toMatchObject({ type: "signup", email: "pending@example.test" });
  await page.clock.fastForward(61_000);
  await page.getByRole("button", { name: "確認メールを再送する", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("メールのリンク");
  expect(sends).toBe(2);
});

test("確認リンクの期限切れと直接アクセスは成功扱いせず、再送へ案内する", async ({ page }) => {
  for (const suffix of [
    "",
    "#error=access_denied&error_code=otp_expired&error_description=private-diagnostic",
  ]) {
    await page.goto(`/auth/confirm${suffix}`);
    await expect(page.getByRole("heading", { name: "メールを確認できませんでした" })).toBeVisible();
    await expect(page).toHaveURL("http://127.0.0.1:3100/auth/confirm");
    await expect(page.getByRole("main")).not.toContainText("private-diagnostic");
    await page.getByRole("link", { name: "確認メールを再送する", exact: true }).click();
    await expect(page.getByLabel("メールアドレス", { exact: true })).toBeVisible();
  }
});

test("実メールのリンクを別ブラウザで確認し、元のブラウザでもログインできる", async ({
  page,
  browser,
  request,
}) => {
  const { publicAuth } = localAuth();
  const email = `gotore-signup-${crypto.randomUUID()}@example.test`;
  await openSignup(page, email);
  await page.getByRole("button", { name: "確認メールを送る", exact: true }).click();
  await expect(page.getByRole("heading", { name: "確認メールをご確認ください" })).toBeVisible();
  let messageId = "";
  await expect
    .poll(async () => {
      const response = await request.get("http://127.0.0.1:59324/api/v1/search", {
        params: { query: `to:${email}` },
      });
      const data = await response.json();
      messageId = data.messages?.[0]?.ID ?? "";
      return !!messageId;
    })
    .toBe(true);
  const mail = await (
    await request.get(`http://127.0.0.1:59324/api/v1/message/${messageId}`)
  ).json();
  const link = String(mail.HTML)
    .match(/href="([^"]+)"/)?.[1]
    ?.replaceAll("&amp;", "&");
  expect(!!link).toBe(true);
  const context = await browser.newContext();
  try {
    const confirmation = await context.newPage();
    await confirmation.goto(link as string);
    await expect(
      confirmation.getByRole("heading", { name: "メールを確認しました", exact: true }),
    ).toBeVisible();
    await expect(confirmation).toHaveURL("http://127.0.0.1:3100/auth/confirm");
    await confirmation.getByRole("link", { name: "GO TOREをはじめる" }).click();
    await expect(confirmation.getByRole("button", { name: "スキップ", exact: true })).toBeVisible();
    await confirmation.getByRole("button", { name: "スキップ", exact: true }).click();
    await expect(confirmation.getByRole("navigation")).toBeVisible();
    await page.getByRole("button", { name: "ログインへ戻る", exact: true }).click();
    await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(page.getByRole("button", { name: "スキップ", exact: true })).toBeVisible();
    const login = await publicAuth.signInWithPassword({ email, password: testPassword });
    expect(login.error).toBeNull();
    const profile = await request.get("http://127.0.0.1:8100/api/me", {
      headers: { Authorization: `Bearer ${login.data.session?.access_token}` },
    });
    expect((await profile.json()).display_name).toBe("登録テスト");
    const duplicate = await publicAuth.signUp({
      email,
      password: "Different-password-2026!",
      options: { data: { display_name: "上書き禁止" } },
    });
    expect(duplicate.data.session).toBeNull();
    const existing = await publicAuth.signInWithPassword({ email, password: testPassword });
    expect(existing.error).toBeNull();
    expect(existing.data.user?.user_metadata.display_name).toBe("登録テスト");
    await confirmation.goto(link as string);
    await expect(
      confirmation.getByRole("heading", { name: "メールを確認できませんでした" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("再送専用ページからログインした場合もホームへ進める", async ({ page }) => {
  await mockTraining(page);
  await page.goto("/auth/resend");
  await page.getByRole("button", { name: "ログインへ戻る", exact: true }).click();
  await page.getByLabel("メールアドレス", { exact: true }).fill("ui@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await expect(page.getByRole("navigation")).toBeVisible();
});

for (const width of [320, 390, 430]) {
  test(`登録画面は${width}pxで入力と主要操作がはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openSignup(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const submit = page.getByRole("button", { name: "確認メールを送る", exact: true });
    expect((await submit.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  });
}
