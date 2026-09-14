import { expect, test } from "@playwright/test";
import { testPassword } from "./local-auth";

test("既存ユーザーはログインでき、一般ユーザー向けの登録入口も表示する", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "新規登録", exact: true })).toBeVisible();
  await expect(page.getByLabel("表示名", { exact: true })).toHaveCount(0);
});

test("ログイン失敗は管理者への案内を表示し、再試行できる", async ({ page }) => {
  await page.route("**/auth/v1/token?grant_type=password", (route) =>
    route.fulfill({
      status: 400,
      headers: {
        "x-supabase-api-version": "2024-01-01",
        "access-control-expose-headers": "x-supabase-api-version",
      },
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
