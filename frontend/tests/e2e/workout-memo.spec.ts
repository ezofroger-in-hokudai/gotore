import { expect, test } from "@playwright/test";
import { mockTraining } from "./mock-training";

test("本人メモの取得・失敗・競合・読み直し・消去を確認し、共有一覧には出さない", async ({
  page,
}) => {
  const { user, group } = await mockTraining(page);
  const record = {
    id: "00000000-0000-0000-0000-000000000010",
    user_id: user.id,
    display_name: "画面テスト",
    group_id: group.id,
    performed_on: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    exercises: [{ name: "スクワット", sets: [{ weight: 60, reps: 8 }] }],
  };
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
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "自分の記録", exact: true })
    .click();
  expect(memoReads).toBe(0);
  await page.getByRole("button", { name: "メモ", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("通信できません");
  await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCount(0);
  failLoad = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  const input = page.getByLabel("メモ", { exact: true });
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("maxlength", "1000");
  await input.fill("フォームを意識できた。次回も丁寧に。\n<script>alert(1)</script>");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("通信できません");
  await expect(input).toHaveValue(
    "フォームを意識できた。次回も丁寧に。\n<script>alert(1)</script>",
  );
  failSave = false;
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "保存しました" })).toBeVisible();
  await input.fill("次回の自分へのメモ");
  conflict = true;
  memo = { content: "別端末で保存した内容", revision: 2 };
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("別の操作");
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
  await expect(page.getByRole("status").filter({ hasText: "保存しました" })).toBeVisible();
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/workout-memo-mobile.png" });
  await input.fill("");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "保存しました" })).toBeVisible();
  expect(memo.content).toBe("");
  expect(dialogs).toBe(0);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  const reads = memoReads;
  await page.getByRole("navigation").getByRole("button", { name: "ホーム", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "メモ", exact: true })).toHaveCount(0);
  expect(memoReads).toBe(reads);
});
