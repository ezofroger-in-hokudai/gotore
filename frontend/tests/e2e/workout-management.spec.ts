import { expect, test } from "@playwright/test";
import { mockTraining } from "./mock-training";

test("編集の競合・キャンセル・保存で新規下書きを保持し、削除を確認する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { user, group } = await mockTraining(page);
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
    if (new URL(route.request().url()).pathname === "/api/workouts/activity")
      return route.fallback();
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
  await page.getByRole("button", { name: "＋ 記録する", exact: true }).click();
  await page.getByLabel("種目名", { exact: true }).selectOption({ label: "スクワット" });
  await page.getByRole("button", { name: "← 戻る", exact: true }).click();
  const draftKey = `gotore:draft:${user.id}`;
  const draft = await page.evaluate((key) => localStorage.getItem(key), draftKey);
  const openRecords = () =>
    page.getByRole("navigation").getByRole("button", { name: "自分の記録", exact: true }).click();
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
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(draft);
  await page.getByRole("button", { name: "＋ 記録する", exact: true }).click();
  await expect(page.getByLabel("種目名", { exact: true })).toHaveValue("スクワット");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
