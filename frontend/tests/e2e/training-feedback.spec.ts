import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 720 } });

test("タップ後も色が戻り、受付セットと次の番号・保存待ちを区別できる", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/sessions/*", async (route) => {
    if (route.request().method() === "PATCH") await gate;
    await route.fallback();
  });
  const next = page.getByRole("button", { name: "次のセットへ", exact: true });
  const color = await next.evaluate((el) => getComputedStyle(el).backgroundColor);
  await next.tap();
  try {
    await expect(page.locator(".save-feedback")).toContainText("SET 1");
    await expect(page.locator(".save-feedback")).toContainText("保存中");
    await expect(next).toContainText("SET 2を記録");
    await expect(next).toBeEnabled();
    await expect(next).toHaveCSS("background-color", color);
    await expect(page.locator(".record-celebration")).toHaveCount(0);
    await next.tap();
    await expect(next).toContainText("SET 3を記録");
    await expect(page.locator(".comparison-row")).toHaveCount(2);
  } finally {
    release();
  }
  await expect(page.locator(".save-feedback")).toContainText("SET 2");
  await expect(page.locator(".save-feedback")).toContainText("保存しました");
  expect(state.session?.exercises[0].sets).toHaveLength(2);
});

test("種目追加はリスト末尾、次種目と終了は枠のあるボタンで操作できる", async ({ page }) => {
  await mockTraining(page);
  await startTraining(page);
  const next = page.getByRole("button", { name: "次の種目へ", exact: true });
  const save = page.getByRole("button", { name: "次のセットへ", exact: true });
  const finish = page.getByRole("button", { name: "トレーニング終了", exact: true });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(next).toBeInViewport();
    await expect(finish).toBeInViewport();
    await expect(next).toHaveCSS("border-top-style", "solid");
    await expect(finish).toHaveCSS("border-top-style", "solid");
    const a = await save.boundingBox();
    const b = await next.boundingBox();
    expect(a?.y).toBe(b?.y);
    expect(a?.width).toBeGreaterThan(b?.width ?? 0);
  }
  await next.tap();
  const last = await page.locator(".session-screen .v2-row").last().boundingBox();
  const add = await page
    .getByRole("button", { name: "新しい種目を追加", exact: true })
    .boundingBox();
  expect(add?.y).toBeGreaterThan((last?.y ?? 0) + (last?.height ?? 0));
});

test("終了を待っていることを表示し、失敗時は保存済みセットを保持して再試行できる", async ({
  page,
}) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("button", { name: "次のセットへ", exact: true }).tap();
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  await page.route("**/api/sessions/*/finish", async (route) => {
    if (fail) {
      await gate;
      return route.fulfill({ status: 503, json: { detail: "終了できません" } });
    }
    return route.fallback();
  });
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).tap();
  await page.getByRole("button", { name: "終了する", exact: true }).tap();
  try {
    await expect(page.getByRole("button", { name: "終了中…", exact: true })).toBeDisabled();
    expect(state.finished).toHaveLength(0);
  } finally {
    release();
  }
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("終了できません");
  await expect(page.getByRole("button", { name: "セット1を編集", exact: true })).toBeEnabled();
  expect(state.session?.exercises[0].sets).toHaveLength(1);
  fail = false;
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).tap();
  await page.getByRole("button", { name: "終了する", exact: true }).tap();
  await expect.poll(() => state.finished.length).toBe(1);
  await navigate(page, "履歴");
  await expect(page.getByText("ベンチプレス", { exact: true }).first()).toBeVisible();
});

test("最高記録の赤色と炎はサーバー保存の確定後に表示する", async ({ page }) => {
  await mockTraining(page);
  await startTraining(page);
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("85");
  await expect(page.getByText("BEST更新候補", { exact: true })).toBeVisible();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/sessions/*", async (route) => {
    if (route.request().method() === "PATCH") await gate;
    await route.fallback();
  });
  await page.getByRole("button", { name: "次のセットへ", exact: true }).tap();
  try {
    await expect(page.locator(".save-feedback")).toContainText("保存中");
    await expect(page.locator(".save-feedback .record-celebration")).toHaveCount(0);
  } finally {
    release();
  }
  const celebration = page.locator(".save-feedback .record-celebration");
  await expect(celebration).toContainText("🔥");
  await expect(celebration).toContainText("BEST更新！ 保存しました");
  await expect(celebration).toHaveCSS("color", "rgb(211, 47, 47)");
  await page.screenshot({ path: "test-results/session-best-feedback.png", fullPage: true });
  await page.getByRole("button", { name: "セット1を編集", exact: true }).tap();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("70");
  await page.getByRole("button", { name: "変更を保存", exact: true }).tap();
  await expect(page.locator(".save-feedback")).toContainText("保存しました");
  await expect(page.locator(".save-feedback .record-celebration")).toHaveCount(0);
});
