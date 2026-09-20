import { expect, test } from "@playwright/test";
import { createTestUser, testPassword } from "./local-auth";
import { navigate } from "./mock-training";

test("実認証で設定から目安箱へ投稿でき、アプリから投稿を読み出せない", async ({ page }) => {
  const run = crypto.randomUUID();
  const email = `suggestion-${run}@example.test`;
  await createTestUser("目安箱テスト", email);
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "スキップ", exact: true }).click();
  await navigate(page, "設定");
  await page.getByRole("button", { name: "目安箱", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "目安箱", exact: true });
  await dialog.getByLabel("内容", { exact: true }).fill(`実認証の送信確認 ${run}`);
  const request = page.waitForRequest((request) => request.url().endsWith("/api/suggestions"));
  const response = page.waitForResponse((response) => response.url().endsWith("/api/suggestions"));
  await dialog.getByRole("button", { name: "送信する", exact: true }).click();
  expect((await response).status()).toBe(201);
  await expect(dialog.getByRole("status")).toContainText("送信しました");
  const sent = await request;
  const headers = { Authorization: sent.headers().authorization };
  const retry = await page.request.post("/api/suggestions", { headers, data: sent.postDataJSON() });
  expect(retry.status()).toBe(201);
  expect(await retry.json()).toEqual(await (await response).json());
  expect((await page.request.get("/api/suggestions", { headers })).status()).toBe(405);
  expect(
    (await page.request.get(`/api/suggestions/${sent.postDataJSON().id}`, { headers })).status(),
  ).toBe(404);
});
