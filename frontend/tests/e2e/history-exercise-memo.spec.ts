import { expect, test } from "./fixtures";
import { mockTraining } from "./mock-training";
import { mockHistoryCalendar, openHistoryDay } from "./personal-history-helper";

test("終了した種目メモを必要時だけ取得し、編集失敗後も元revisionで再送する", async ({ page }) => {
  const state = await mockTraining(page, true, false, false);
  const record = {
    id: "00000000-0000-0000-0000-000000000010",
    user_id: state.user.id,
    display_name: "画面テスト",
    group_id: null,
    performed_on: "2026-10-01",
    created_at: "2026-10-01T00:00:00Z",
    revision: 1,
    exercises: [{ name: "ベンチプレス", sets: [{ weight: 60, reps: 10 }] }],
  };
  await mockHistoryCalendar(page, () => [record]);
  await page.route("**/api/workouts?*", (r) => r.fulfill({ json: [record] }));
  let reads = 0;
  let fail = true;
  let memo = { content: "肩に注意する", revision: 2 };
  const revisions: number[] = [];
  await page.route("**/api/sessions/*/exercise-memo?*", (r) => {
    expect(new URL(r.request().url()).searchParams.get("name")).toBe("ベンチプレス");
    if (r.request().method() === "GET") {
      reads++;
      return r.fulfill({ json: memo });
    }
    const body = r.request().postDataJSON();
    revisions.push(body.expected_revision);
    if (fail) return r.fulfill({ status: 503, json: { detail: "メモを保存できません" } });
    memo = { content: body.content, revision: 3 };
    return r.fulfill({ json: memo });
  });
  const detail = await openHistoryDay(page, record.performed_on);
  expect(reads).toBe(0);
  await page.getByRole("button", { name: "ベンチプレスの記録メモを開く", exact: true }).click();
  const edit = page.getByRole("button", { name: "ベンチプレスの記録メモを編集", exact: true });
  await expect(edit).toHaveText(memo.content);
  await edit.click();
  const input = page.getByRole("textbox", { name: "ベンチプレスの記録メモ", exact: true });
  await input.fill("次回は軽くする");
  await input.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "未送信" })).toBeVisible();
  await expect(input).toHaveCount(0);
  await detail.getByRole("button", { name: "閉じる", exact: true }).click();
  await openHistoryDay(page, record.performed_on);
  await expect(page.getByRole("status").filter({ hasText: "未送信" })).toBeVisible();
  await expect(input).toHaveCount(0);
  await page.getByRole("button", { name: "ベンチプレスの記録メモを開く", exact: true }).click();
  await expect(input).toHaveValue("次回は軽くする");
  fail = false;
  await page.getByRole("button", { name: "再送", exact: true }).click();
  await expect(edit).toHaveText("次回は軽くする");
  expect(revisions).toEqual([2, 2]);
  expect(reads).toBe(1);
});

test("終了後の旧下書きも本人履歴から元revisionのまま再送する", async ({ page }) => {
  const state = await mockTraining(page, true, false, false);
  const record = {
    id: "00000000-0000-0000-0000-000000000010",
    user_id: state.user.id,
    display_name: "画面テスト",
    group_id: null,
    performed_on: "2026-10-01",
    created_at: "2026-10-01T00:00:00Z",
    revision: 1,
    exercises: [{ name: "ベンチプレス", sets: [{ weight: 60, reps: 10 }] }],
  };
  await mockHistoryCalendar(page, () => [record]);
  await page.route("**/api/workouts?*", (r) => r.fulfill({ json: [record] }));
  const path = `/sessions/${record.id}/exercise-memo?name=${encodeURIComponent("ベンチプレス")}`;
  const key = `gotore:memo-input:v1:${state.user.id}:${path}`;
  await page.evaluate(
    ({ key }) =>
      localStorage.setItem(key, JSON.stringify({ content: "終了前の未送信メモ", revision: 4 })),
    { key },
  );
  let body: { content: string; expected_revision: number } | null = null;
  await page.route("**/api/sessions/*/exercise-memo?*", (r) => {
    if (r.request().method() === "PUT") {
      const submitted: { content: string; expected_revision: number } = r.request().postDataJSON();
      body = submitted;
      return r.fulfill({ json: { content: submitted.content, revision: 5 } });
    }
    return r.fulfill({ json: { content: "前回保存したメモ", revision: 4 } });
  });
  await openHistoryDay(page, record.performed_on);
  await page.getByRole("button", { name: "ベンチプレスの記録メモを開く", exact: true }).click();
  const field = page.getByRole("textbox", { name: "ベンチプレスの記録メモ", exact: true });
  await expect(field).toHaveValue("終了前の未送信メモ");
  await field.press("Enter");
  await expect.poll(() => body).toEqual({ content: "終了前の未送信メモ", expected_revision: 4 });
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
});
