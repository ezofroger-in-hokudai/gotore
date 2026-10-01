import { expect, test } from "./fixtures";
import { emptyTodayActivity, mockTraining } from "./mock-training";
import { mockHistoryCalendar, openHistoryDay } from "./personal-history-helper";

test("本人メモの取得・失敗・競合・読み直し・消去を確認し、共有一覧には出さない", async ({
  page,
}) => {
  const { user, group } = await mockTraining(page, true, false, false);
  const record = {
    id: "00000000-0000-0000-0000-000000000010",
    user_id: user.id,
    display_name: "画面テスト",
    group_id: group.id,
    performed_on: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    revision: 1,
    exercises: [{ name: "スクワット", sets: [{ weight: 60, reps: 8 }] }],
  };
  await mockHistoryCalendar(page, () => [record]);
  let memo = { content: "", revision: 0 };
  let failLoad = true;
  let failSave = true;
  let conflict = false;
  let memoReads = 0;
  let dialogs = 0;
  page.on("dialog", async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  await page.route("**/api/groups/*/workouts**", (route) => route.fulfill({ json: [record] }));
  await page.route("**/api/workouts**", (route) => {
    if (new URL(route.request().url()).pathname === "/api/workouts/activity")
      return route.fallback();
    if (!new URL(route.request().url()).pathname.endsWith("/memo"))
      return route.fulfill({ json: [record] });
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      if (failSave) return route.abort();
      if (conflict)
        return route.fulfill({ status: 409, json: { detail: "メモは別の操作で変更されています" } });
      expect(body.expected_revision).toBe(memo.revision);
      memo = { content: body.content, revision: memo.revision + 1 };
      return route.fulfill({ json: memo });
    }
    memoReads++;
    if (failLoad) return route.abort();
    return route.fulfill({ json: memo });
  });
  const detail = await openHistoryDay(page, record.performed_on);
  expect(memoReads).toBe(0);
  await page.getByRole("button", { name: "メモ", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("メモを開けません");
  await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCount(0);
  failLoad = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  const input = page.getByLabel("メモ", { exact: true });
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("maxlength", "1000");
  await input.fill("フォームを意識できた。次回も丁寧に。\n<script>alert(1)</script>");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".workout-memo").getByRole("status")).toContainText("未送信");
  await expect(page.locator(".workout-memo").getByRole("alert")).toHaveCount(0);
  await expect(input).toHaveCount(0);
  await page.locator(".workout-memo").getByRole("button", { name: "メモ", exact: true }).click();
  await expect(input).toHaveValue(
    "フォームを意識できた。次回も丁寧に。\n<script>alert(1)</script>",
  );
  failSave = false;
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.locator(".workout-memo").getByRole("button", { name: "メモ", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workout-memo")).not.toContainText("保存しました");
  await page.locator(".workout-memo").getByRole("button", { name: "メモ", exact: true }).click();
  await input.fill("次回の自分へのメモ");
  conflict = true;
  memo = { content: "別端末で保存した内容", revision: 2 };
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("別の変更");
  await expect(input).toHaveValue("次回の自分へのメモ");
  await page.getByRole("button", { name: "読み直す", exact: true }).click();
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(input).toHaveValue("次回の自分へのメモ");
  await page.getByRole("button", { name: "読み直す", exact: true }).click();
  await page.getByRole("button", { name: "破棄して読み直す", exact: true }).click();
  await expect(input).toHaveValue(memo.content);
  conflict = false;
  await input.fill("フォームを意識できた。次回も丁寧に。");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.locator(".workout-memo").getByRole("button", { name: "メモ", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workout-memo")).not.toContainText("保存しました");
  await page.locator(".workout-memo").getByRole("button", { name: "メモ", exact: true }).click();
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/workout-memo-mobile.png" });
  await input.fill("");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.locator(".workout-memo").getByRole("button", { name: "メモ", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workout-memo")).not.toContainText("保存しました");
  await page.locator(".workout-memo").getByRole("button", { name: "メモ", exact: true }).click();
  await expect.poll(() => memo.content).toBe("");
  expect(dialogs).toBe(0);
  await page.locator(".workout-memo").getByRole("button", { name: "閉じる", exact: true }).click();
  await detail.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.route(`**/api/groups/${group.id}/workouts/${record.id}`, (route) =>
    route.fulfill({ json: record }),
  );
  await page.route("**/api/groups/today-activity", (route) => {
    const activity = emptyTodayActivity([group]);
    const feed = [
      {
        workout_id: record.id,
        user_id: user.id,
        display_name: record.display_name,
        exercise: "スクワット",
        weight: 60,
        reps: 8,
        estimated_rm: 76,
        updated_at: record.created_at,
        best: false,
        summary: { exercise_count: 1, set_count: 1, total_volume: 480 },
      },
    ];
    return route.fulfill({ json: { ...activity, groups: [{ ...activity.groups[0], feed }] } });
  });
  const reads = memoReads;
  await page.getByRole("navigation").getByRole("button", { name: "ホーム", exact: true }).click();
  await expect(page.locator(".community-feed .record")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "メモ", exact: true })).toHaveCount(0);
  expect(memoReads).toBe(reads);
});
