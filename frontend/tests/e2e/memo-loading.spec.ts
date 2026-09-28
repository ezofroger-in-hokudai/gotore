import { expect, test } from "@playwright/test";
import { mockTraining, openTraining } from "./mock-training";

test("種目メモの取得中は安定した入口を表示し、取得後だけ編集できる", async ({ page }) => {
  await mockTraining(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/exercises/context?*", async (route) => {
    await gate;
    return route.fallback();
  });
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  try {
    await page.getByRole("button", { name: /^ベンチプレス/ }).click();
    const memo = page.getByRole("region", { name: "種目メモ", exact: true });
    const pending = memo.getByRole("button", { name: "種目メモを準備中" });
    await expect(pending).toHaveText("メモ");
    await expect(pending).toBeDisabled();
    await expect(memo).not.toContainText("読み込み中");
    const height = (await memo.boundingBox())?.height;
    await expect(page.getByRole("button", { name: "セットを追加", exact: true })).toBeEnabled();
    release();
    await expect(memo.getByRole("button", { name: "種目メモを編集" })).toBeEnabled();
    expect((await memo.boundingBox())?.height).toBe(height);
  } finally {
    release();
  }
});

test("取得中は端末にある種目メモの下書きを先に表示する", async ({ page }) => {
  const state = await mockTraining(page);
  await page.evaluate((userId) => {
    localStorage.setItem(
      `gotore:memo-input:v1:${userId}:ベンチプレス`,
      JSON.stringify({ content: "次回はフォーム確認", revision: 0 }),
    );
  }, state.user.id);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/exercises/context?*", async (route) => {
    await gate;
    return route.fallback();
  });
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  try {
    await page.getByRole("button", { name: /^ベンチプレス/ }).click();
    const memo = page.getByRole("region", { name: "種目メモ", exact: true });
    await expect(memo).toContainText("次回はフォーム確認");
    await expect(memo.getByRole("button", { name: "種目メモを準備中" })).toBeDisabled();
    release();
    await expect(memo.getByRole("textbox", { name: "種目メモ" })).toHaveValue("次回はフォーム確認");
  } finally {
    release();
  }
});

test("開始確定前の今日のメモも安定表示し、確定後に編集できる", async ({ page }) => {
  await mockTraining(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/sessions", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await gate;
    return route.fallback();
  });
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  try {
    await page.getByRole("button", { name: /^ベンチプレス/ }).click();
    const memo = page.getByRole("region", { name: "今日のメモ", exact: true });
    const pending = memo.getByRole("button", { name: "今日のメモを準備中" });
    await expect(pending).toHaveText("メモ");
    await expect(pending).toBeDisabled();
    await expect(memo).not.toContainText("読み込み中");
    const height = (await memo.boundingBox())?.height;
    release();
    await expect(memo.getByRole("button", { name: "今日のメモを編集" })).toBeEnabled();
    expect((await memo.boundingBox())?.height).toBe(height);
  } finally {
    release();
  }
});

test("種目メモの取得失敗時は編集させず、再試行後に開ける", async ({ page }) => {
  await mockTraining(page);
  let fail = true;
  await page.route("**/api/exercises/context?*", (route) => {
    if (fail) return route.fulfill({ status: 503, json: { detail: "取得できません" } });
    return route.fallback();
  });
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  await page.getByRole("button", { name: /^ベンチプレス/ }).click();
  const memo = page.getByRole("region", { name: "種目メモ", exact: true });
  await expect(memo.getByRole("button", { name: "種目メモを準備中" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "再試行", exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(memo.getByRole("button", { name: "種目メモを編集" })).toBeEnabled();
});
