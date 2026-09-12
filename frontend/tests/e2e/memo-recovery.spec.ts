import { expect, test } from "@playwright/test";
import { mockTraining, openRecord, startTraining } from "./mock-training";

test("未保存メモを終了時に案内し、履歴でも元の版を保って復元する", async ({ page }) => {
  const state = await mockTraining(page);
  let memo = { content: "", revision: 0 };
  let failSave = false;
  let failLoad = false;
  const revisions: number[] = [];
  await page.route("**/api/workouts/*/memo", (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      revisions.push(body.expected_revision);
      if (failSave) return route.abort();
      if (body.expected_revision !== memo.revision)
        return route.fulfill({ status: 409, json: { detail: "別の操作で変更されています" } });
      memo = { content: body.content, revision: memo.revision + 1 };
    }
    if (failLoad) return route.abort();
    return route.fulfill({ json: memo });
  });
  await startTraining(page);
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect.poll(() => state.saves).toBe(1);
  const key = `gotore:memo-input:v1:${state.user.id}:/workouts/${state.session?.id}/memo`;
  const otherKeys = [
    key.replace(state.user.id, "another-user"),
    `gotore:memo-input:v1:${state.user.id}:ベンチプレス`,
    `gotore:memo-input:v1:${state.user.id}:/workouts/previous-record/memo`,
  ];
  await page.evaluate((keys) => {
    for (const k of keys)
      localStorage.setItem(k, JSON.stringify({ content: "別対象のメモ", revision: 7 }));
  }, otherKeys);
  await page.getByRole("button", { name: "今回のメモを編集" }).click();
  await page.getByLabel("今回のメモ", { exact: true }).fill("消したくないメモ");
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "トレーニング終了" });
  await expect(confirmation).toContainText("未保存のメモ");
  await confirmation.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByLabel("今回のメモ", { exact: true })).toHaveValue("消したくないメモ");
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  await confirmation.getByRole("button", { name: "終了する", exact: true }).click();
  await expect.poll(() => state.finished.length).toBe(1);
  memo = { content: "別端末で保存したメモ", revision: 1 };
  await page.reload();
  await openRecord(page);
  await page.getByRole("button", { name: "メモ", exact: true }).click();
  const field = page.getByLabel("メモ", { exact: true });
  await expect(field).toHaveValue("消したくないメモ");
  failSave = true;
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("通信できません");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "メモ", exact: true }).click();
  await expect(field).toHaveValue("消したくないメモ");
  failSave = false;
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("別の操作");
  expect(revisions).toEqual([0, 0]);
  expect(memo.content).toBe("別端末で保存したメモ");
  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), key))
    .toEqual({ content: "消したくないメモ", revision: 0 });
  await page.getByRole("button", { name: "読み直す", exact: true }).click();
  failLoad = true;
  await page.getByRole("button", { name: "破棄して読み直す", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("通信できません");
  await expect(field).toHaveValue("消したくないメモ");
  failLoad = false;
  await page.getByRole("button", { name: "破棄して読み直す", exact: true }).click();
  await expect(field).toHaveValue(memo.content);
  await field.fill("確認して更新したメモ");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "保存しました" })).toBeVisible();
  expect(revisions).toEqual([0, 0, 1]);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  expect(
    await page.evaluate(
      (keys) => keys.map((k) => JSON.parse(localStorage.getItem(k) || "null")),
      otherKeys,
    ),
  ).toEqual(otherKeys.map(() => ({ content: "別対象のメモ", revision: 7 })));
});

test("端末保存できないメモを履歴から復元できると案内しない", async ({ page }) => {
  await mockTraining(page);
  await startTraining(page);
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("gotore:memo-input:"))
        throw new DOMException("full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "今回のメモを編集" }).click();
  await page.getByLabel("今回のメモ", { exact: true }).fill("端末保存できないメモ");
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "トレーニング終了" });
  await expect(confirmation).toContainText("端末に保持できていません");
  await expect(confirmation).not.toContainText("履歴から保存できます");
  await confirmation.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByLabel("今回のメモ", { exact: true })).toHaveValue("端末保存できないメモ");
});
