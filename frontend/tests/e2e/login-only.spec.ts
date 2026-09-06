import { expect, test } from "@playwright/test";
import { localAuth, testPassword } from "./local-auth";

test("ログイン専用画面は管理者発行を案内し、新規登録を提供しない", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "ログインする →", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "新規登録", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("表示名", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("アカウントは管理者が発行します。利用する方は管理者にお問い合わせください。", {
      exact: true,
    }),
  ).toBeVisible();
});

test("一般ユーザー向けAuth APIから新規登録できない", async () => {
  const { publicAuth } = localAuth();
  const { data, error } = await publicAuth.signUp({
    email: `gotore-blocked-${crypto.randomUUID()}@example.test`,
    password: testPassword,
  });
  expect(error?.code).toBe("signup_disabled");
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
  const submit = page.getByRole("button", { name: "ログインする →", exact: true });
  await submit.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "管理者にお問い合わせください",
  );
  await expect(submit).toBeEnabled();
});
