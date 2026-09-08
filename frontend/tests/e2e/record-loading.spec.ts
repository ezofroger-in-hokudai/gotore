import { expect, test } from "@playwright/test";
import { mockTraining } from "./mock-training";

test("自分の記録は再訪時に表示を保持し、更新失敗時は古い記録を隠す", async ({ page }) => {
  const { user } = await mockTraining(page);
  const record = {
    id: "00000000-0000-0000-0000-000000000010",
    user_id: user.id,
    display_name: "画面テスト",
    group_id: null,
    performed_on: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    revision: 1,
    exercises: [{ name: "保存済みスクワット", sets: [{ weight: 20, reps: 10 }] }],
  };
  let block = false;
  let fail = false;
  let removed = false;
  let release: (() => void) | undefined;
  await page.route("**/api/workouts?**", async (route) => {
    if (block)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    if (fail) return route.fulfill({ status: 401, json: { detail: "ログインし直してください。" } });
    return route.fulfill({ json: removed ? [] : [record] });
  });
  const go = (name: string) =>
    page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
  await go("自分の記録");
  await expect(page.getByRole("heading", { name: "保存済みスクワット" })).toBeVisible();
  await go("ホーム");
  block = true;
  await go("自分の記録");
  await expect(page.getByRole("heading", { name: "保存済みスクワット" })).toBeVisible({
    timeout: 500,
  });
  await expect(page.getByRole("status").filter({ hasText: "更新中" })).toBeVisible();
  await page.screenshot({ path: "test-results/record-loading-mobile.png", fullPage: true });
  await expect.poll(() => Boolean(release)).toBe(true);
  record.exercises[0].name = "更新後スクワット";
  release?.();
  await expect(page.getByRole("heading", { name: "更新後スクワット" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "更新中" })).toHaveCount(0);
  await go("ホーム");
  block = false;
  fail = true;
  await go("自分の記録");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("ログインし直して");
  await expect(page.getByRole("article")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByRole("heading", { name: "更新後スクワット" })).toBeVisible();
  await page.route(`**/api/workouts/${record.id}?**`, (route) => {
    removed = true;
    return route.fulfill({ status: 204 });
  });
  block = true;
  release = undefined;
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.getByRole("article")).toHaveCount(0);
  release?.();
  await expect(page.getByRole("heading", { name: "記録なし", exact: true })).toBeVisible();
});

test("保持した自分の記録は別ユーザーへ引き継がない", async ({ page }) => {
  const { user } = await mockTraining(page);
  const record = {
    id: "00000000-0000-0000-0000-000000000010",
    user_id: user.id,
    display_name: "最初の利用者",
    group_id: null,
    performed_on: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    revision: 1,
    exercises: [{ name: "最初の利用者の記録", sets: [{ weight: 20, reps: 10 }] }],
  };
  let release: (() => void) | undefined;
  let nextUser = false;
  await page.route("**/api/workouts?**", async (route) => {
    if (nextUser) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ json: [record] });
  });
  const records = () =>
    page.getByRole("navigation").getByRole("button", { name: "自分の記録", exact: true }).click();
  await records();
  await expect(page.getByRole("heading", { name: "最初の利用者の記録" })).toBeVisible();
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeVisible();
  user.id = "00000000-0000-0000-0000-000000000009";
  nextUser = true;
  await page.getByLabel("メールアドレス", { exact: true }).fill("next@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("ui-test-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await records();
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "読み込み中" })).toBeVisible();
  release?.();
  await expect(page.getByRole("heading", { name: "記録なし", exact: true })).toBeVisible();
});
