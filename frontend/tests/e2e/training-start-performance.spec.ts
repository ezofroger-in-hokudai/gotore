import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("開始前に重量と回数を準備でき、開始待ちに保存要求を出さない", async ({ page }) => {
  const state = await mockTraining(page);
  await navigate(page, "記録");
  await page.getByRole("button", { name: /^スクワット/ }).click();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("80");
  await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("6");
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
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toBeEnabled();
    await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("82.5");
    await page.getByRole("spinbutton", { name: "回数", exact: true }).press("Enter");
    expect(state.session).toBeNull();
    expect(state.saves).toBe(0);
  } finally {
    release();
  }
  await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toBeEnabled();
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
    expect(url.searchParams.get("session_id")).toBeTruthy();
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

test("開始応答で既存セッションが返った場合は端末の入力を優先して復元する", async ({ page }) => {
  const state = await mockTraining(page);
  await navigate(page, "記録");
  await expect(page.getByRole("button", { name: "トレーニングを開始", exact: true })).toBeEnabled();
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
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ベンチプレス", exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("62.5");
  await expect(page.getByRole("spinbutton", { name: "回数", exact: true })).toHaveValue("9");
  expect(state.saves).toBe(0);
});
