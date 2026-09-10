import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

test("未保存入力と保存済みセットをタブ切替・再起動後も復元し、明示終了する", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page, "スクワット");
  const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
  const reps = page.getByRole("spinbutton", { name: "回数", exact: true });
  await weight.fill("60.5");
  await reps.fill("8");
  await navigate(page, "ホーム");
  expect(state.saves).toBe(0);
  await page.reload();
  await navigate(page, "記録");
  await expect(weight).toHaveValue("60.5");
  state.failSave = true;
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("未送信");
  await expect(weight).toHaveValue("60.5");
  state.failSave = false;
  await page.getByRole("button", { name: "再送", exact: true }).click();
  await expect(page.getByText("保存しました", { exact: true })).toBeVisible();
  expect(state.session?.exercises[0].sets).toEqual([{ weight: 60.5, reps: 8 }]);
  await navigate(page, "ホーム");
  await expect(page.getByRole("article")).toContainText("60.5");
  await page.reload();
  await navigate(page, "記録");
  await expect(page.getByRole("button", { name: "セット1を編集", exact: true })).toContainText(
    "60.5",
  );
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  await page.getByRole("button", { name: "終了する", exact: true }).click();
  await expect(page.getByText("トレーニングを終了しました。", { exact: true })).toBeVisible();
  expect(state.session).toBeNull();
  expect(state.finished).toHaveLength(1);
});

test("ホイール・直接入力・行編集・取消を区別し、BESTとRMを表示する", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
  await weight.fill("80");
  await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("8");
  await page.getByRole("button", { name: "重量を増やす", exact: true }).click();
  await expect(weight).toHaveValue("81");
  await expect(page.locator(".record-candidate")).toBeVisible();
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.locator(".save-feedback .record-celebration")).toBeVisible();
  await page.getByRole("button", { name: "セット1を編集", exact: true }).click();
  await weight.fill("70");
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  expect(state.session?.exercises[0].sets[0].weight).toBe(81);
  await page.getByRole("button", { name: "セット1を編集", exact: true }).click();
  await weight.fill("75");
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  expect(state.session?.exercises[0].sets).toHaveLength(1);
  await page.getByRole("button", { name: "直前の保存を取り消す", exact: true }).click();
  await expect(page.getByText("直前の保存を取り消しました", { exact: true })).toBeVisible();
  await expect.poll(() => state.session?.exercises[0].sets[0].weight).toBe(81);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/v2-record-${width}.png`,
      fullPage: true,
    });
  }
});

test("保存応答を失ったまま再起動しても二重追加せず、古い編集を上書きしない", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("80");
  await page.route(
    "**/api/sessions/*",
    (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      const body = route.request().postDataJSON();
      if (state.session)
        state.session = {
          ...state.session,
          exercises: body.exercises,
          revision: state.session.revision + 1,
        };
      return route.abort();
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("未送信");
  await page.reload();
  await navigate(page, "記録");
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  expect(state.session?.exercises[0].sets).toHaveLength(1);
  await page.getByRole("button", { name: "セット1を編集", exact: true }).click();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("82.5");
  if (state.session)
    state.session = {
      ...state.session,
      revision: state.session.revision + 1,
      exercises: [{ name: "ベンチプレス", sets: [{ weight: 85, reps: 10 }] }],
    };
  await page.reload();
  await navigate(page, "記録");
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("82.5");
  await expect(page.getByRole("button", { name: "変更を保存", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "セット1を編集", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("85");
  await expect(page.getByRole("button", { name: "変更を保存", exact: true })).toBeEnabled();
});

test("重量Enterは保存せず回数欄へ移動する", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
  const reps = page.getByRole("spinbutton", { name: "回数", exact: true });
  await weight.fill("77.5");
  await weight.press("Enter");
  await expect(reps).toBeFocused();
  expect(state.saves).toBe(0);
  expect(state.session?.exercises).toHaveLength(0);
});

test("Enterの長押し・IME確定・不正な重量では移動や保存をしない", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
  const reps = page.getByRole("spinbutton", { name: "回数", exact: true });
  for (const field of [weight, reps]) {
    await field.focus();
    for (const extra of [{ repeat: true }, { isComposing: true }]) {
      const prevented = await field.evaluate((element, extra) => {
        const event = new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
          ...extra,
        });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      }, extra);
      expect(prevented).toBe(true);
      await expect(field).toBeFocused();
    }
  }
  for (const value of ["", "1001", "77.55"]) {
    await weight.fill(value);
    await weight.press("Enter");
    await expect(weight).toBeFocused();
  }
  expect(state.saves).toBe(0);
  await weight.fill("77.5");
  await weight.press("Enter");
  await reps.fill("8");
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect.poll(() => state.saves).toBe(1);
  expect(state.session?.exercises[0].sets).toEqual([{ weight: 77.5, reps: 8 }]);
  await page.getByRole("button", { name: "セット1を編集", exact: true }).click();
  await weight.fill("80");
  await weight.press("Enter");
  await expect(reps).toBeFocused();
  expect(state.saves).toBe(1);
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  await expect.poll(() => state.saves).toBe(2);
  expect(state.session?.exercises[0].sets).toEqual([{ weight: 80, reps: 8 }]);
});
