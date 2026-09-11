import { type ElementHandle, expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("開始前に重量と回数を準備でき、開始待ちに保存要求を出さない", async ({ page }) => {
  const state = await mockTraining(page);
  let focusedField: ElementHandle<HTMLElement | SVGElement> | null = null;
  await navigate(page, "記録");
  await page.getByRole("button", { name: /^スクワット/ }).click();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("80");
  await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("6");
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let comparisonStarted = false;
  await page.route("**/api/exercises/context?*", (route) => {
    if (!new URL(route.request().url()).searchParams.has("session_id")) comparisonStarted = true;
    return route.fallback();
  });
  await page.route("**/api/sessions", async (route) => {
    await gate;
    return route.fallback();
  });
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  try {
    await expect(page.locator(".session-screen.entering-sets")).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole("region", { name: "全セットの比較", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toBeDisabled();
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toBeEnabled();
    await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("82.5");
    focusedField = await page
      .getByRole("spinbutton", { name: "回数", exact: true })
      .elementHandle();
    await page.getByRole("spinbutton", { name: "回数", exact: true }).press("Enter");
    await expect.poll(() => comparisonStarted).toBe(true);
    await expect(page.locator(".personal-bests")).toContainText("80");
    expect(state.session).toBeNull();
    expect(state.saves).toBe(0);
  } finally {
    release();
  }
  await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toBeEnabled();
  expect(await focusedField?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await focusedField?.evaluate((element) => document.activeElement === element)).toBe(true);
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("82.5");
  await expect(page.getByRole("spinbutton", { name: "回数", exact: true })).toHaveValue("6");
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect.poll(() => state.saves).toBe(1);
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  expect(state.session?.exercises[0]).toEqual({
    name: "スクワット",
    sets: [{ weight: 82.5, reps: 6 }],
  });
  expect(state.saves).toBe(1);
});

test("種目をタップする前に比較を取得し、選択と再選択で取得済み情報を再利用する", async ({
  page,
}) => {
  await mockTraining(page);
  await navigate(page, "記録");
  const reads: string[] = [];
  await page.route("**/api/exercises/context?*", (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.get("session_id")) return route.fallback();
    reads.push(url.searchParams.get("name") || "");
    return route.fallback();
  });
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  await expect.poll(() => reads.includes("スクワット")).toBe(true);
  await page.getByRole("button", { name: /^スクワット/ }).click();
  await expect(page.getByRole("button", { name: "種目メモを編集", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  await page.getByRole("button", { name: /^ベンチプレス/ }).click();
  await expect(page.getByRole("button", { name: "種目メモを編集", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  await page.getByRole("button", { name: /^スクワット/ }).click();
  await expect(page.getByRole("button", { name: "種目メモを編集", exact: true })).toBeEnabled();
  expect(reads.filter((name) => name === "スクワット")).toHaveLength(1);
});

test("非表示中の候補取得を止め、復帰後の失敗では古い比較を隠す", async ({ page }) => {
  await mockTraining(page);
  await navigate(page, "記録");
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  await page.getByRole("button", { name: /^ベンチプレス/ }).click();
  await expect(page.getByRole("button", { name: "種目メモを編集", exact: true })).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  let requests = 0;
  await page.route("**/api/exercises/context?*", (route) => {
    requests++;
    return route.fulfill({ status: 503, json: { detail: "比較を取得できません" } });
  });
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  await page.getByRole("button", { name: /^スクワット/ }).click();
  await page.waitForTimeout(300);
  expect(requests).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".session-context").getByRole("alert")).toContainText(
    "比較を取得できません",
  );
  await expect(page.locator(".personal-bests")).toContainText("—");
  await expect(page.getByRole("button", { name: "種目メモを編集", exact: true })).toHaveCount(0);
  await page.unroute("**/api/exercises/context?*");
  await page
    .locator(".session-context")
    .getByRole("button", { name: "再試行", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "種目メモを編集", exact: true })).toBeEnabled();
});

for (const savedInput of [true, false]) {
  test(`既存セッションへ切り替わると${savedInput ? "端末の入力を優先する" : "開始待ちの入力を引き継ぐ"}`, async ({
    page,
  }) => {
    const state = await mockTraining(page);
    await navigate(page, "記録");
    await expect(
      page.getByRole("button", { name: "トレーニングを開始", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: /^スクワット/ }).click();
    await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("80");
    const id = "00000000-0000-0000-0000-000000000099";
    state.session = {
      id,
      user_id: state.user.id,
      display_name: "画面テスト",
      group_id: null,
      shared_group_ids: [state.group.id],
      exercises: [{ name: "ベンチプレス", sets: [{ weight: 60, reps: 10 }] }],
      revision: 4,
      performed_on: "2026-09-11",
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      ended_at: null,
    };
    if (savedInput)
      await page.evaluate(
        ({ userId, id }) => {
          localStorage.setItem(
            `gotore:session-input:v2:${userId}:${id}`,
            JSON.stringify({
              name: "ベンチプレス",
              weight: "62.5",
              reps: "9",
              revision: 4,
              editing: null,
              dirty: true,
            }),
          );
        },
        { userId: state.user.id, id },
      );
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/sessions", async (route) => {
      await gate;
      return route.fallback();
    });
    await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
    try {
      await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("82.5");
      await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("7");
    } finally {
      release();
    }
    await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toBeEnabled();
    await expect(
      page.getByRole("heading", { name: savedInput ? "ベンチプレス" : "スクワット", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue(
      savedInput ? "62.5" : "82.5",
    );
    await expect(page.getByRole("spinbutton", { name: "回数", exact: true })).toHaveValue(
      savedInput ? "9" : "7",
    );
    expect(state.saves).toBe(0);
  });
}
