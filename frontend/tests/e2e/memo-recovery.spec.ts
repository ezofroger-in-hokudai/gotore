import { expect, test } from "./fixtures";
import { mockTraining, openTraining, startTraining } from "./mock-training";

test("今日の種目メモは通信失敗と再起動でも元のrevisionと下書きを保持する", async ({ page }) => {
  const state = await mockTraining(page);
  let memo = { content: "", revision: 0 };
  let fail = true;
  const revisions: number[] = [];
  await page.route("**/api/sessions/*/exercise-memo?*", (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      revisions.push(body.expected_revision);
      if (fail) return route.fulfill({ status: 503, json: { detail: "メモを保存できません" } });
      if (body.expected_revision !== memo.revision)
        return route.fulfill({ status: 409, json: { detail: "別の操作で変更されています" } });
      memo = { content: body.content, revision: memo.revision + 1 };
    }
    return route.fulfill({ json: memo });
  });
  await startTraining(page);
  const field = page.getByRole("textbox", { name: "今日のメモ", exact: true });
  await page.getByRole("button", { name: "今日のメモを編集", exact: true }).click();
  await field.fill("消したくないメモ");
  await field.press("Enter");
  await expect(
    page.getByRole("region", { name: "今日のメモ", exact: true }).getByRole("status"),
  ).toContainText("未送信");
  const key = `gotore:memo-input:v1:${state.user.id}:/sessions/${state.session?.id}/exercise-memo?name=${encodeURIComponent("ベンチプレス")}`;
  const otherKey = key.replace(state.user.id, "another-user");
  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify({ content: "別利用者", revision: 7 })),
    otherKey,
  );
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), key))
    .toEqual({ content: "消したくないメモ", revision: 0 });
  memo = { content: "別端末で保存", revision: 1 };
  await page.reload();
  await openTraining(page);
  await expect(field).toHaveValue("消したくないメモ");
  fail = false;
  await field.press("Enter");
  await expect(
    page.getByRole("region", { name: "今日のメモ", exact: true }).getByRole("alert"),
  ).toContainText("別の変更");
  expect(revisions).toEqual([0, 0, 0]);
  expect(memo.content).toBe("別端末で保存");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("region", { name: "今日のメモ", exact: true })
    .getByRole("button", { name: "読み直す", exact: true })
    .click();
  await expect(field).toHaveValue("別端末で保存");
  await field.fill("確認して更新したメモ");
  await field.press("Enter");
  await expect.poll(() => memo.content).toBe("確認して更新したメモ");
  expect(revisions).toEqual([0, 0, 0, 1]);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), otherKey),
  ).toEqual({ content: "別利用者", revision: 7 });
});

test("メモの端末保存失敗を知らせ、通信失敗と終了確認から戻っても入力を保持する", async ({
  page,
}) => {
  await mockTraining(page);
  await startTraining(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("gotore:memo-input:"))
        throw new DOMException("full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.route("**/api/sessions/*/exercise-memo?*", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 503, json: { detail: "保存できません" } })
      : route.fallback(),
  );
  await page.getByRole("button", { name: "今日のメモを編集", exact: true }).click();
  const field = page.getByRole("textbox", { name: "今日のメモ", exact: true });
  await field.fill("端末保存できないメモ");
  await expect(
    page.getByRole("region", { name: "今日のメモ", exact: true }).getByRole("alert"),
  ).toContainText("メモを保持できません");
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "トレーニング終了", exact: true });
  await expect(confirmation).not.toContainText("履歴から保存できます");
  await confirmation.getByRole("button", { name: "トレーニングに戻る", exact: true }).click();
  await expect(field).toHaveValue("端末保存できないメモ");
});
