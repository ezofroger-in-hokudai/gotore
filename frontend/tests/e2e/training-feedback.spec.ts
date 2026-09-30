import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 720 } });

test("セット送信中も次のセットを追加でき、通常の送信状態文は出さない", async ({ page }) => {
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
  const next = page.getByRole("button", { name: "セットを追加", exact: true });
  const color = await next.evaluate((el) => getComputedStyle(el).backgroundColor);
  await next.tap();
  try {
    await expect(page.getByRole("button", { name: "セット1を編集" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "SET 2", exact: true })).toBeVisible();
    await expect(next).toBeEnabled();
    await expect(next).toHaveCSS("background-color", color);
    await expect(page.locator(".sync-status, .save-feedback")).toHaveCount(0);
    await expect(page.locator(".record-celebration")).toHaveCount(0);
    await next.tap();
    await expect(page.getByRole("heading", { name: "SET 3", exact: true })).toBeVisible();
    await expect(page.locator(".comparison-row")).toHaveCount(2);
    expect(state.saves).toBe(0);
  } finally {
    release();
  }
  await expect.poll(() => state.saves).toBe(2);
  await expect(page.locator(".sync-status, .save-feedback")).toHaveCount(0);
  expect(state.session?.exercises[0].sets).toHaveLength(2);
});

test("種目追加はリスト末尾、次種目と終了を押しやすいボタンで操作できる", async ({ page }) => {
  await mockTraining(page);
  await startTraining(page);
  const next = page.getByRole("button", { name: "次の種目へ", exact: true });
  const save = page.getByRole("button", { name: "セットを追加", exact: true });
  const finish = page.getByRole("button", { name: "トレーニング終了", exact: true });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(next).toBeInViewport();
    await expect(finish).toBeInViewport();
    await expect(next).toHaveCSS("border-top-style", "solid");
    const finishBox = await finish.boundingBox();
    expect(finishBox?.width).toBeGreaterThanOrEqual(48);
    expect(finishBox?.height).toBeGreaterThanOrEqual(40);
    const a = await save.boundingBox();
    const b = await next.boundingBox();
    expect(a?.y).toBe(b?.y);
    expect(a?.width).toBeGreaterThan(b?.width ?? 0);
  }
  await next.tap();
  const last = await page.locator(".session-screen .v2-row").last().boundingBox();
  const add = await page.getByRole("button", { name: "＋ 種目を追加", exact: true }).boundingBox();
  expect(add?.y).toBeGreaterThanOrEqual((last?.y ?? 0) + (last?.height ?? 0));
});

test("終了を端末へ残して直ちに結果へ進み、通信失敗後に自動再送する", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("button", { name: "セットを追加", exact: true }).tap();
  await expect.poll(() => state.saves).toBe(1);
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
    await expect(page.getByRole("heading", { name: "おつかれさまでした。" })).toBeVisible();
    await expect(page.locator(".workout-result")).not.toContainText("保存済み");
    expect(state.finished).toHaveLength(0);
    const queue = await page.evaluate(
      (userId) => localStorage.getItem(`gotore:session-queue:v1:${userId}`),
      state.user.id,
    );
    expect(queue).toContain('"finish":true');
  } finally {
    release();
  }
  await expect(page.locator(".workout-result")).not.toContainText("終了できません");
  expect(state.session?.exercises[0].sets).toHaveLength(1);
  fail = false;
  await expect.poll(() => state.finished.length).toBe(1);
  await expect(page.locator(".workout-result")).toContainText("保存済み");
});

test("終了通信失敗後の再起動でも終了意図を復元して自動再送する", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  let fail = true;
  await page.route("**/api/sessions/*/finish", (route) =>
    fail ? route.fulfill({ status: 503, json: { detail: "一時的な失敗" } }) : route.fallback(),
  );
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).tap();
  await page.getByRole("button", { name: "終了する", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "おつかれさまでした。" })).toBeVisible();
  await page.locator(".workout-result").getByRole("button", { name: "ホーム" }).click();
  await expect(page.getByTestId("floating-training")).toBeDisabled();
  await navigate(page, "履歴");
  await expect(page.getByRole("navigation", { name: "メインナビゲーション" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("floating-training")).toBeDisabled();
  const queue = await page.evaluate(
    (userId) => localStorage.getItem(`gotore:session-queue:v1:${userId}`),
    state.user.id,
  );
  expect(queue).toContain('"finish":true');
  fail = false;
  await expect.poll(() => state.finished.length).toBe(1);
  await expect(page.getByTestId("floating-training")).toBeEnabled();
});

test("終了待ちの確認や再送ボタンを表示せず自動再送して次を始められる", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  let fail = true;
  await page.route("**/api/sessions/*/finish", (route) =>
    fail ? route.fulfill({ status: 503, json: { detail: "一時的な失敗" } }) : route.fallback(),
  );
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).tap();
  await page.getByRole("button", { name: "終了する", exact: true }).tap();
  await page.locator(".workout-result").getByRole("button", { name: "ホーム" }).click();
  const start = page.getByTestId("floating-training");
  await expect(start).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "終了を再送する" })).toHaveCount(0);
  await expect(page.getByText("前のトレーニングの終了を確認", { exact: false })).toHaveCount(0);
  fail = false;
  await expect.poll(() => state.finished.length).toBe(1);
  await expect(start).toBeEnabled();
  await start.tap();
  await expect(page.getByRole("button", { name: "トレーニング終了", exact: true })).toBeVisible();
});

test("セット送信の応答待ち中も終了を受け付け、セットの後に終了する", async ({ page }) => {
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
  await page.getByRole("button", { name: "セットを追加", exact: true }).tap();
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).tap();
  await page.getByRole("button", { name: "終了する", exact: true }).tap();
  try {
    await expect(page.getByRole("heading", { name: "おつかれさまでした。" })).toBeVisible();
    expect(state.saves).toBe(0);
    expect(state.finished).toHaveLength(0);
  } finally {
    release();
  }
  await expect.poll(() => state.saves).toBe(1);
  await expect.poll(() => state.finished.length).toBe(1);
  expect(state.finished[0].exercises[0].sets).toHaveLength(1);
});

test("終了の競合では端末記録を確認してからサーバー記録を採用できる", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("button", { name: "セットを追加", exact: true }).tap();
  await expect.poll(() => state.saves).toBe(1);
  await page.route("**/api/sessions/*/finish", (route) =>
    route.fulfill({ status: 409, json: { detail: "別の更新があります" } }),
  );
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).tap();
  await page.getByRole("button", { name: "終了する", exact: true }).tap();
  await expect(page.getByRole("button", { name: "記録を確認" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "記録を確認" }).click();
  await expect(page.getByRole("textbox", { name: "端末に残っている記録" })).toHaveValue(
    /ベンチプレス/,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "サーバーの記録を採用" }).click();
  await expect(page.getByRole("button", { name: "記録を確認" })).toHaveCount(0);
  const queue = await page.evaluate(
    (userId) => localStorage.getItem(`gotore:session-queue:v1:${userId}`),
    state.user.id,
  );
  expect(queue).not.toContain('"finish":true');
});

test("BEST候補は送信待ち中に確定演出へ変えず、確定後の記録を残す", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("85");
  await expect(page.locator(".record-candidate")).toBeVisible();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/sessions/*", async (route) => {
    if (route.request().method() === "PATCH") await gate;
    await route.fallback();
  });
  await page.getByRole("button", { name: "セットを追加", exact: true }).tap();
  try {
    await expect(page.getByRole("button", { name: "セット1を編集" })).toBeVisible();
    await expect(page.locator(".record-celebration")).toHaveCount(0);
    expect(state.saves).toBe(0);
  } finally {
    release();
  }
  await expect.poll(() => state.saves).toBe(1);
  await expect(page.getByRole("button", { name: "セット1を編集" })).toContainText("85kg");
  await page.getByRole("button", { name: "セット1を編集", exact: true }).tap();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("70");
  await page.getByRole("button", { name: "変更を保存", exact: true }).tap();
  await expect.poll(() => state.saves).toBe(2);
  await expect(page.getByRole("button", { name: "セット1を編集" })).toContainText("70kg");
});
