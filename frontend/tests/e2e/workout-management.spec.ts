import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

test("編集の競合・キャンセル・保存で新規下書きを保持し、削除を確認する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockTraining(page);
  const { user, group } = state;
  let record = {
    id: "00000000-0000-0000-0000-000000000010",
    user_id: user.id,
    display_name: "画面テスト",
    group_id: group.id,
    performed_on: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    revision: 1,
    exercises: [{ name: "ベンチプレス", sets: [{ weight: 60, reps: 8 }] }],
  };
  let removed = false;
  let conflict = true;
  let failDelete = true;
  let deletes = 0;
  await page.route("**/api/workouts**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/workouts/activity" || path.endsWith("/memo")) return route.fallback();
    const request = route.request();
    if (request.method() === "PATCH") {
      const body = request.postDataJSON();
      expect(Object.keys(body).sort()).toEqual(["exercises", "expected_revision", "performed_on"]);
      expect(body.expected_revision).toBe(1);
      if (conflict)
        return route.fulfill({
          status: 409,
          json: { detail: "一覧に戻って最新の内容を確認してください" },
        });
      record = {
        ...record,
        performed_on: body.performed_on,
        exercises: body.exercises,
        revision: 2,
      };
      return route.fulfill({ json: record });
    }
    if (request.method() === "DELETE") {
      deletes++;
      expect(new URL(request.url()).searchParams.get("expected_revision")).toBe("2");
      if (failDelete) return route.abort();
      removed = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: removed ? [] : [record] });
  });
  await startTraining(page, "スクワット");
  const draftKey = `gotore:session-input:v2:${user.id}:${state.session?.id}`;
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey))
    .not.toBeNull();
  const draft = await page.evaluate((key) => localStorage.getItem(key), draftKey);
  await page.route("**/api/workouts/activity?*", (route) =>
    route.fulfill({
      json: {
        month: new URL(route.request().url()).searchParams.get("month"),
        metric: "sets",
        days: removed ? [] : [{ date: record.performed_on, set_count: 1, workout_count: 1 }],
        total_sets: removed ? 0 : 1,
        workout_count: removed ? 0 : 1,
        active_days: removed ? 0 : 1,
      },
    }),
  );
  const openRecords = async () => {
    await navigate(page, "履歴");
    await page.getByLabel("月", { exact: true }).fill("2026-01");
    await page.getByRole("button", { name: "2026年1月1日、1セット、1件", exact: true }).click();
    await page.locator(".history-row").click();
  };
  await openRecords();
  await page.getByRole("button", { name: "編集", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "共有先", exact: true })).toBeDisabled();
  await page.getByLabel("種目1 セット1 重量", { exact: true }).fill("70");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "一覧に戻って最新の内容を確認してください",
  );
  await expect(page.getByLabel("種目1 セット1 重量", { exact: true })).toHaveValue("70");
  await page.getByRole("button", { name: "← 戻る", exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(draft);
  conflict = false;
  await page.getByRole("button", { name: "編集", exact: true }).click();
  await expect(page.getByLabel("種目1 セット1 重量", { exact: true })).toHaveValue("60");
  await page.getByLabel("種目1 セット1 重量", { exact: true }).fill("70");
  await page.screenshot({ path: "test-results/workout-edit-mobile.png" });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "更新しました" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(draft);
  await page.getByRole("button", { name: "‹ 履歴", exact: true }).click();
  await expect(page.getByLabel("月", { exact: true })).toHaveValue("2026-01");
  await expect(
    page.getByRole("button", {
      name: "2026年1月1日、1セット、1件",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator(".history-row").click();
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  expect(deletes).toBe(0);
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await page.screenshot({ path: "test-results/workout-delete-mobile.png" });
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("通信できません");
  await expect(page.getByRole("article")).toHaveCount(1);
  failDelete = false;
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByLabel("月", { exact: true })).toHaveValue("2026-01");
  await expect(
    page.getByRole("button", {
      name: "2026年1月1日、0セット、0件",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(draft);
  await navigate(page, "記録");
  await expect(page.getByRole("heading", { name: "スクワット", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
