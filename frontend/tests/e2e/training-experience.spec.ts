import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

test("全セットを一覧で確認し、追加操作を表示したまま次の種目を記録する", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  for (let i = 0; i < 8; i++) {
    await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await expect(page.getByRole("heading", { name: `SET ${i + 2}`, exact: true })).toBeVisible();
  }
  await expect(page.locator(".comparison-row")).toHaveCount(8);
  await page.locator(".comparison-table").evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(page.getByRole("button", { name: "セット1を編集", exact: true })).toBeInViewport();
  await page.locator(".comparison-table").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole("button", { name: "セット8を編集", exact: true })).toBeInViewport();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "次の種目へ", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await page.screenshot({ path: "test-results/session-all-sets.png", fullPage: true });
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  await expect(page.getByRole("region", { name: "今回のトレーニング" })).toContainText("8セット");
  await expect(page.getByRole("region", { name: "今回のトレーニング" }).locator("li")).toHaveCount(
    8,
  );
  await page.screenshot({ path: "test-results/session-overview.png", fullPage: true });
  await page.getByRole("button", { name: /^スクワット/ }).click();
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect
    .poll(() => state.session?.exercises.map((e) => e.name))
    .toEqual(["ベンチプレス", "スクワット"]);
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  await page.getByRole("button", { name: "新しい種目を追加", exact: true }).click();
  await page.getByLabel("新しい種目", { exact: true }).fill("ケーブルロウ");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("追加しました");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: /^ケーブルロウ/ }).click();
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect
    .poll(() => state.session?.exercises.map((e) => e.name))
    .toEqual(["ベンチプレス", "スクワット", "ケーブルロウ"]);
});

test("開始応答を待ちながら入力でき、失敗後の再試行でも入力を保持する", async ({ page }) => {
  await mockTraining(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  const ids: string[] = [];
  await page.route("**/api/sessions", async (route) => {
    ids.push(route.request().postDataJSON().id);
    if (fail) {
      await gate;
      return route.fulfill({ status: 503, json: { detail: "開始できません" } });
    }
    return route.fallback();
  });
  await navigate(page, "記録");
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  try {
    await page.getByRole("button", { name: /^スクワット/ }).click({ timeout: 2000 });
    await page
      .getByRole("spinbutton", { name: "重量", exact: true })
      .fill("42.5", { timeout: 2000 });
    await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("8");
    await page.getByRole("spinbutton", { name: "回数", exact: true }).press("Enter");
    await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("開始できません");
  fail = false;
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  await expect(page.getByRole("heading", { name: "スクワット", exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("42.5");
  await expect(page.getByRole("spinbutton", { name: "回数", exact: true })).toHaveValue("8");
  expect(new Set(ids).size).toBe(1);
});

test("履歴の読み込み前から日付グリッドを表示し、再訪で領域が消えない", async ({ page }) => {
  await mockTraining(page);
  let release = () => {};
  let gate: Promise<void> | null = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workouts/activity?*", async (route) => {
    if (gate) await gate;
    return route.fallback();
  });
  await navigate(page, "履歴");
  try {
    await expect(page.locator(".activity-grid")).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".activity-totals")).toContainText("—");
    await expect(page.locator(".activity-day").first()).toBeDisabled();
  } finally {
    release();
    gate = null;
  }
  await expect(page.locator(".activity-day").first()).toBeEnabled();
  const height = await page
    .locator(".activity-grid")
    .evaluate((el) => el.getBoundingClientRect().height);
  await navigate(page, "ホーム");
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await navigate(page, "履歴");
  try {
    await expect(page.locator(".activity-day").first()).toBeEnabled({ timeout: 1000 });
    expect(
      await page.locator(".activity-grid").evaluate((el) => el.getBoundingClientRect().height),
    ).toBe(height);
  } finally {
    release();
    gate = null;
  }
});

test("保存後の比較再取得中も種目メモと入力位置を保持する", async ({ page }) => {
  await mockTraining(page);
  await startTraining(page);
  const memo = page.getByRole("button", { name: "種目メモを編集", exact: true });
  await expect(memo).toBeEnabled();
  await expect(page.getByRole("button", { name: "今回のメモを編集", exact: true })).toBeEnabled();
  const before = await page.locator(".set-entry").boundingBox();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/exercises/context?*", async (route) => {
    await gate;
    await route.fallback();
  });
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  try {
    await expect(memo).toBeVisible({ timeout: 1000 });
    const after = await page.locator(".set-entry").boundingBox();
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(2);
  } finally {
    release();
  }
});

test("ホームは再訪時に活動を保持し、権限エラー時は古い共有内容を隠す", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  await navigate(page, "ホーム");
  await expect(page.locator(".community-feed")).toContainText("ベンチプレス");
  await navigate(page, "設定");
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/groups/${state.group.id}/activity`, async (route) => {
    await gate;
    return route.fulfill({ status: 403, json: { detail: "このグループを閲覧できません" } });
  });
  await navigate(page, "ホーム");
  try {
    await expect(page.locator(".community-feed")).toContainText("ベンチプレス", { timeout: 1000 });
  } finally {
    release();
  }
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("閲覧できません");
  await expect(page.locator(".community-feed")).toHaveCount(0);
});
