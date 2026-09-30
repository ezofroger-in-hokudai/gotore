import { expect, test } from "./fixtures";
import { historyMonth } from "./history-period-helper";
import { mockTraining, openTraining, startTraining } from "./mock-training";
import { mockHistoryCalendar, openHistoryDay } from "./personal-history-helper";

test("編集の競合・キャンセル・保存で新規下書きを保持し、削除を確認する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockTraining(page, true, false, false);
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
  const memoKey = `gotore:memo-input:v1:${user.id}:/workouts/${record.id}/memo`;
  await page.evaluate(
    (key) =>
      localStorage.setItem(key, JSON.stringify({ content: "削除するまで残す", revision: 0 })),
    memoKey,
  );
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
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("92.5");
  const draftKey = `gotore:session-input:v2:${user.id}:${state.session?.id}`;
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), draftKey))
    .toMatchObject({ name: "スクワット", weight: "92.5", dirty: true });
  const draft = await page.evaluate((key) => localStorage.getItem(key), draftKey);
  await mockHistoryCalendar(page, () => (removed ? [] : [record]));
  const openRecords = async () => {
    await openHistoryDay(page, record.performed_on);
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
  await openRecords();
  await page.getByRole("button", { name: "編集", exact: true }).click();
  await expect(page.getByLabel("種目1 セット1 重量", { exact: true })).toHaveValue("60");
  await page.getByLabel("種目1 セット1 重量", { exact: true }).fill("70");
  await page.screenshot({ path: "test-results/workout-edit-mobile.png" });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(() => record.exercises[0].sets[0].weight).toBe(70);
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(draft);
  expect(await historyMonth(page)).toBe("2026-01");
  await expect(
    page.getByRole("button", { name: "2026年1月1日、560kg、1セット", exact: true }),
  ).toBeVisible();
  await openRecords();
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  expect(deletes).toBe(0);
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await page.screenshot({ path: "test-results/workout-delete-mobile.png" });
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("通信できません");
  await expect(page.getByRole("article")).toHaveCount(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), memoKey)).not.toBeNull();
  failDelete = false;
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), memoKey)).toBeNull();
  expect(await historyMonth(page)).toBe("2026-01");
  await expect(
    page.getByRole("button", { name: "2026年1月1日、記録なし", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(draft);
  await openTraining(page);
  await expect(page.locator(".recording-exercise-title")).toHaveText("スクワット");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
