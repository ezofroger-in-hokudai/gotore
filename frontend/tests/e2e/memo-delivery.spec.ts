import { expect, test } from "./fixtures";
import { mockTraining, navigate, openTraining, startTraining } from "./mock-training";

test("今日のメモは端末受付後すぐ閉じ、別画面の失敗を再送して新しい編集も守る", async ({ page }) => {
  const state = await mockTraining(page);
  let memo = { content: "", revision: 0 };
  const writes: { content: string; expected_revision: number }[] = [];
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/sessions/*/exercise-memo?*", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1) {
        await gate;
        return route.fulfill({ status: 503, json: { detail: "メモ送信失敗" } });
      }
      expect(body.expected_revision).toBe(memo.revision);
      memo = { content: body.content, revision: memo.revision + 1 };
    }
    return route.fulfill({ json: memo });
  });
  await startTraining(page);
  const region = page.getByRole("region", { name: "今日のメモ", exact: true });
  const field = region.getByRole("textbox", { name: "今日のメモ", exact: true });
  await region.getByRole("button", { name: "今日のメモを編集", exact: true }).click();
  await field.fill("最初のメモ");
  await field.press("Enter");
  await expect(field).toHaveCount(0, { timeout: 1000 });
  await region.getByRole("button", { name: "今日のメモを編集", exact: true }).click();
  await expect(field).toBeEnabled();
  await field.fill("新しいメモ");
  await field.press("Enter");
  await navigate(page, "ホーム");
  release();
  const notice = page.getByRole("region", { name: "メモの送信状態", exact: true });
  await expect(notice.getByRole("alert")).toContainText("ベンチプレス");
  await notice.getByRole("button", { name: "再送", exact: true }).click();
  await expect.poll(() => memo.content).toBe("新しいメモ");
  expect(writes.map((value) => value.expected_revision)).toEqual([0, 0, 1]);
  const key = `gotore:memo-input:v1:${state.user.id}:/sessions/${state.session?.id}/exercise-memo?name=${encodeURIComponent("ベンチプレス")}`;
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  await openTraining(page);
  await expect(region.getByRole("button", { name: "今日のメモを編集", exact: true })).toHaveText(
    "新しいメモ",
  );
});

test("メモの応答を失っても再起動の再送で同じ内容を二重更新しない", async ({ page }) => {
  await mockTraining(page);
  let memo = { content: "", revision: 0 };
  const revisions: number[] = [];
  await page.route("**/api/sessions/*/exercise-memo?*", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      revisions.push(body.expected_revision);
      if (memo.revision === body.expected_revision)
        memo = { content: body.content, revision: memo.revision + 1 };
      else {
        expect(body.expected_revision + 1).toBe(memo.revision);
        expect(body.content).toBe(memo.content);
      }
      if (revisions.length === 1) return route.abort();
    }
    return route.fulfill({ json: memo });
  });
  await startTraining(page);
  const region = page.getByRole("region", { name: "今日のメモ", exact: true });
  await region.getByRole("button", { name: "今日のメモを編集", exact: true }).click();
  const field = region.getByRole("textbox", { name: "今日のメモ", exact: true });
  await field.fill("応答を失っても残る");
  await field.press("Enter");
  await expect(region.getByRole("alert")).toContainText("通信できません");
  await page.reload();
  await openTraining(page);
  await expect.poll(() => revisions).toEqual([0, 0]);
  await expect(region.getByRole("button", { name: "今日のメモを編集", exact: true })).toHaveText(
    "応答を失っても残る",
  );
  expect(memo.revision).toBe(1);
});

test("送信中のログアウトで要求を保持し、別ユーザーへ持ち越さない", async ({ page }) => {
  const state = await mockTraining(page);
  const originalId = state.user.id;
  let writes = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/sessions/*/exercise-memo?*", async (route) => {
    if (route.request().method() !== "PUT")
      return route.fulfill({ json: { content: "", revision: 0 } });
    writes++;
    await gate;
    await route.fulfill({ json: { content: "元ユーザーのメモ", revision: 1 } });
  });
  await startTraining(page);
  await page.getByRole("button", { name: "今日のメモを編集", exact: true }).click();
  const field = page.getByRole("textbox", { name: "今日のメモ", exact: true });
  await field.fill("元ユーザーのメモ");
  await field.press("Enter");
  await expect.poll(() => writes).toBe(1);
  await navigate(page, "設定");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page
    .getByRole("dialog", { name: "ログアウト", exact: true })
    .getByRole("button", { name: "ログアウト", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeVisible();
  release();
  state.user.id = "00000000-0000-0000-0000-000000000099";
  state.user.user_metadata.display_name = "別のユーザー";
  state.session = null;
  await page.evaluate(
    (id) => localStorage.setItem(`gotore:onboarding:v2:${id}`, "seen"),
    state.user.id,
  );
  await page.getByLabel("メールアドレス", { exact: true }).fill("other@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("ui-test-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await navigate(page, "設定");
  await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("別のユーザー");
  await expect(page.getByRole("region", { name: "メモの送信状態", exact: true })).toHaveCount(0);
  expect(writes).toBe(1);
  const queue = await page.evaluate(
    (id) => Object.keys(localStorage).filter((key) => key.startsWith(`gotore:memo-send:v1:${id}:`)),
    originalId,
  );
  expect(queue).toHaveLength(1);
});
