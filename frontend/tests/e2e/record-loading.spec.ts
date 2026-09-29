import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("履歴は再訪時の表示を保持し、認証エラー時は古い記録を隠す", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
  const state = await mockTraining(page);
  const record = {
    id: "record",
    user_id: state.user.id,
    display_name: "画面テスト",
    group_id: null,
    performed_on: "2026-09-28",
    created_at: "2026-09-28T03:00:00Z",
    revision: 1,
    exercises: [{ name: "保存済みスクワット", sets: [{ weight: 20, reps: 10 }] }],
  };
  let fail = false;
  let hold: Promise<void> | null = null;
  let release = () => {};
  await page.route("**/api/workouts?**", async (route) => {
    if (hold) await hold;
    return route.fulfill(
      fail ? { status: 401, json: { detail: "ログインし直してください。" } } : { json: [record] },
    );
  });
  await navigate(page, "履歴");
  await page.locator(".personal-history-days button").nth(27).click();
  await expect(page.getByRole("table", { name: "保存済みスクワット" })).toBeVisible();
  await page.getByRole("button", { name: "閉じる" }).click();
  await navigate(page, "ホーム");
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await navigate(page, "履歴");
  await page.locator(".personal-history-days button").nth(27).click();
  await expect(page.getByRole("table", { name: "保存済みスクワット" })).toBeVisible({
    timeout: 1000,
  });
  record.exercises[0].name = "更新後スクワット";
  release();
  hold = null;
  await expect(page.getByRole("table", { name: "更新後スクワット" })).toBeVisible();
  await page.getByRole("button", { name: "閉じる" }).click();
  await navigate(page, "ホーム");
  fail = true;
  await navigate(page, "履歴");
  await page.locator(".personal-history-days button").nth(27).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("ログインし直して");
  await expect(page.getByRole("table", { name: "更新後スクワット" })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByRole("table", { name: "更新後スクワット" })).toBeVisible();
});

test("ログアウト後の別利用者へ履歴と入力を引き継がない", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
  const state = await mockTraining(page);
  const originalId = state.user.id;
  await page.route("**/api/workouts?**", (route) =>
    route.fulfill({
      json:
        state.user.id === originalId
          ? [
              {
                id: "old",
                user_id: originalId,
                display_name: "最初の利用者",
                group_id: null,
                performed_on: "2026-09-28",
                created_at: "2026-09-28T03:00:00Z",
                revision: 1,
                exercises: [{ name: "最初の利用者の記録", sets: [{ weight: 20, reps: 10 }] }],
              },
            ]
          : [],
    }),
  );
  await navigate(page, "履歴");
  await page.locator(".personal-history-days button").nth(27).click();
  await expect(page.getByRole("table", { name: "最初の利用者の記録" })).toBeVisible();
  await page.getByRole("button", { name: "閉じる" }).click();
  await navigate(page, "設定");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeVisible();
  state.user.id = "00000000-0000-0000-0000-000000000009";
  await page.getByLabel("メールアドレス", { exact: true }).fill("next@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("ui-test-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "スキップ" }).click();
  await navigate(page, "履歴");
  await page.locator(".personal-history-days button").nth(27).click();
  await expect(page.getByRole("table", { name: "最初の利用者の記録" })).toHaveCount(0);
  await expect(page.getByText("この日の記録はありません", { exact: true })).toBeVisible();
});
