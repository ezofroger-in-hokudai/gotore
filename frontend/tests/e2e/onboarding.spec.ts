import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

test("初回ガイドは完了・再ログイン後に再表示せず、設定から読み直せる", async ({
  page,
}, testInfo) => {
  const state = await mockTraining(page, true, true);
  const guide = page.getByRole("region", { name: "使い方ガイド" });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("1 / 3");
  await guide.getByRole("button", { name: "次へ", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(guide.getByRole("heading")).toBeFocused();
  await expect(guide).toContainText("2 / 3");
  await guide.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(guide).toContainText("1 / 3");
  await guide.getByRole("button", { name: "次へ", exact: true }).click();
  await guide.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(guide).toContainText("カレンダーはその日の最高SCORE");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("onboarding-mobile.png"), fullPage: false });
  await guide.getByRole("button", { name: "はじめる", exact: true }).click();
  await expect(guide).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(guide).toHaveCount(0);
  await navigate(page, "設定");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page.getByLabel("メールアドレス", { exact: true }).fill("ui@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("ui-test-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(guide).toHaveCount(0);
  await page.getByRole("navigation").getByRole("button", { name: "設定", exact: true }).click();
  await page.getByRole("button", { name: /^使い方/ }).click();
  await expect(guide).toContainText("1 / 3");
  await expect(guide.getByRole("heading")).toBeFocused();
  expect(state.authUpdates).toBe(0);
  expect(state.syncs).toBe(0);
});

test("他ユーザーの表示済み状態を使わず、スキップしても下書きと共有先を変えない", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("gotore:onboarding:v1:other-user", "seen");
  });
  const state = await mockTraining(page, true, true);
  const guide = page.getByRole("region", { name: "使い方ガイド" });
  await expect(guide).toBeVisible();
  await startTraining(page);
  const key = `gotore:session-input:v2:${state.user.id}:${state.session?.id}`;
  await expect
    .poll(() => page.evaluate((value) => localStorage.getItem(value), key))
    .not.toBeNull();
  const draft = await page.evaluate((value) => localStorage.getItem(value), key);
  await guide.getByRole("button", { name: "スキップ", exact: true }).click();
  await expect(guide).toHaveCount(0);
  expect(await page.evaluate((value) => localStorage.getItem(value), key)).toBe(draft);
  await page.reload();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(guide).toHaveCount(0);
});

test("表示済みの保存ができなくてもガイドを閉じて通常操作を続けられる", async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith("gotore:onboarding:")) throw new Error("storage unavailable");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("gotore:onboarding:")) throw new Error("storage unavailable");
      return set.call(this, key, value);
    };
  });
  await mockTraining(page, true, true);
  const guide = page.getByRole("region", { name: "使い方ガイド" });
  await expect(guide).toContainText("次回もガイドが表示される場合があります");
  await guide.getByRole("button", { name: "スキップ", exact: true }).click();
  await expect(guide).toHaveCount(0);
  await page.getByRole("navigation").getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.getByRole("button", { name: /^表示名/ })).toBeVisible();
});
