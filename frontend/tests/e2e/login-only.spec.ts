import { expect, test } from "@playwright/test";
import { localAuth, testPassword } from "./local-auth";

test("Googleでの登録と既存メールログインを案内する", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "新規登録", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("表示名", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Googleで続ける" })).toBeVisible();
  await expect(page.getByText("メールで登録済みの方", { exact: true })).toBeVisible();
});

test("一般ユーザー向けAuth APIからメールで新規登録できない", async () => {
  const { publicAuth } = localAuth();
  const { data, error } = await publicAuth.signUp({
    email: `gotore-blocked-${crypto.randomUUID()}@example.test`,
    password: testPassword,
    options: { data: { provider: "google", app_metadata: { provider: "google" } } },
  });
  expect(error?.status).toBe(403);
  expect(error?.message).toContain("新規登録にはGoogle");
  expect(data.user).toBeNull();
  expect(data.session).toBeNull();
});

test("ログイン失敗は管理者への案内を表示し、再試行できる", async ({ page }) => {
  await page.route("**/auth/v1/token?grant_type=password", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ code: "invalid_credentials", msg: "Invalid login credentials" }),
    }),
  );
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill("gotore-invalid@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  const submit = page.getByRole("button", { name: "ログイン", exact: true });
  await submit.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("解決しなければ管理者へ");
  await expect(submit).toBeEnabled();
});
