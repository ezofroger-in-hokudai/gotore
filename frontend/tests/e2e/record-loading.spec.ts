import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("履歴は再訪時の表示を保持し、認証エラー時は古い記録を隠す", async ({ page }) => {
  const state = await mockTraining(page);
  const record = {
    id: "record",
    user_id: state.user.id,
    display_name: "画面テスト",
    group_id: null,
    performed_on: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
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
  await expect(page.locator(".history-row")).toContainText("保存済みスクワット");
  await navigate(page, "ホーム");
  hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await navigate(page, "履歴");
  await expect(page.locator(".history-row")).toContainText("保存済みスクワット", { timeout: 1000 });
  await expect(page.getByRole("status").filter({ hasText: "更新中" })).toBeVisible();
  record.exercises[0].name = "更新後スクワット";
  release();
  hold = null;
  await expect(page.locator(".history-row")).toContainText("更新後スクワット");
  await navigate(page, "ホーム");
  fail = true;
  await navigate(page, "履歴");
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("ログインし直して");
  await expect(page.locator(".history-row")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.locator(".history-row")).toContainText("更新後スクワット");
});

test("ログアウト後の別利用者へ履歴と入力を引き継がない", async ({ page }) => {
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
                performed_on: "2026-01-01",
                created_at: "2026-01-01T00:00:00Z",
                revision: 1,
                exercises: [{ name: "最初の利用者の記録", sets: [{ weight: 20, reps: 10 }] }],
              },
            ]
          : [],
    }),
  );
  await navigate(page, "履歴");
  await expect(page.locator(".history-row")).toContainText("最初の利用者の記録");
  await navigate(page, "設定");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeVisible();
  state.user.id = "00000000-0000-0000-0000-000000000009";
  await page.getByLabel("メールアドレス", { exact: true }).fill("next@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("ui-test-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await navigate(page, "履歴");
  await expect(page.locator(".history-row")).toHaveCount(0);
  await expect(page.getByText("まだ記録がありません", { exact: true })).toBeVisible();
});
