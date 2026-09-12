import { expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

test("前回の最初の重量・回数を初期値にし、入力だけでは保存しない", async ({ page }) => {
  const state = await mockTraining(page);
  await page.route("**/api/exercises/context?*", (route) =>
    route.fulfill({
      json: {
        best_weight: 80,
        best_rm: 101.3,
        previous: {
          id: "previous",
          performed_on: "2026-01-01",
          sets: [
            { weight: 62.5, reps: 8 },
            { weight: 75, reps: 10 },
          ],
        },
        memo: { content: "", revision: 0 },
      },
    }),
  );
  await startTraining(page);
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("62.5");
  await expect(page.getByRole("spinbutton", { name: "回数", exact: true })).toHaveValue("8");
  await page.screenshot({ path: "test-results/first-set-defaults.png", fullPage: true });
  expect(state.session?.exercises).toEqual([]);
  expect(state.saves).toBe(0);
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("65");
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect.poll(() => state.session?.exercises[0]?.sets).toEqual([{ weight: 65, reps: 8 }]);
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  await page.getByRole("button", { name: /^スクワット/ }).click();
  await page.getByRole("button", { name: "種目を変更", exact: true }).click();
  await page.getByRole("button", { name: /^ベンチプレス/ }).click();
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("65");
});

for (const first of [{ weight: 0, reps: 12 }, null]) {
  test(`前回${first ? "0kg" : "なし"}の初期値を区別する`, async ({ page }) => {
    await mockTraining(page);
    await page.route("**/api/exercises/context?*", (route) =>
      route.fulfill({
        json: {
          best_weight: null,
          best_rm: null,
          previous: first ? { id: "previous", performed_on: "2026-01-01", sets: [first] } : null,
          memo: { content: "", revision: 0 },
        },
      }),
    );
    await startTraining(page);
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue(
      String(first?.weight ?? 20),
    );
    await expect(page.getByRole("spinbutton", { name: "回数", exact: true })).toHaveValue(
      String(first?.reps ?? 10),
    );
  });
}

for (const edited of [false, true]) {
  test(`前回の応答が遅いとき${edited ? "手入力を上書きしない" : "未入力なら最初のセットを反映する"}`, async ({
    page,
  }) => {
    const state = await mockTraining(page);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/exercises/context?*", async (route) => {
      await gate;
      await route.fulfill({
        json: {
          best_weight: 62.5,
          best_rm: 79.2,
          previous: {
            id: "previous",
            performed_on: "2026-01-01",
            sets: [{ weight: 62.5, reps: 8 }],
          },
          memo: { content: "", revision: 0 },
        },
      });
    });
    try {
      await startTraining(page);
      const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
      const reps = page.getByRole("spinbutton", { name: "回数", exact: true });
      await expect(weight).toHaveValue("20");
      if (edited) {
        await weight.fill("91.5");
        await reps.fill("7");
      }
      release();
      await expect(page.locator(".comparison-table")).toContainText("62.5");
      await expect(weight).toHaveValue(edited ? "91.5" : "62.5");
      await expect(reps).toHaveValue(edited ? "7" : "8");
      expect(state.saves).toBe(0);
      const key = `gotore:session-input:v2:${state.user.id}:${state.session?.id}`;
      await expect
        .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), key))
        .toMatchObject({ awaitingPrevious: false, weight: edited ? "91.5" : "62.5" });
      await page.reload();
      await page.getByRole("navigation").getByRole("button", { name: "記録", exact: true }).click();
      await expect(weight).toHaveValue(edited ? "91.5" : "62.5");
    } finally {
      release();
    }
  });
}

test("以前保存した端末入力は前回値で置き換えない", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("80");
  await page.addInitScript(
    ({ user, session }) => {
      localStorage.setItem(
        `gotore:session-input:v2:${user}:${session}`,
        JSON.stringify({
          name: "ベンチプレス",
          weight: "42.5",
          reps: "6",
          editing: null,
          dirty: false,
          revision: 0,
        }),
      );
    },
    { user: state.user.id, session: state.session?.id },
  );
  await page.reload();
  await page.getByRole("navigation").getByRole("button", { name: "記録", exact: true }).click();
  await expect(page.locator(".comparison-table")).toContainText("80");
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("42.5");
  await expect(page.getByRole("spinbutton", { name: "回数", exact: true })).toHaveValue("6");
});

test("切り替え前の種目の遅い応答で現在の初期値を変えない", async ({ page }) => {
  const state = await mockTraining(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let benchReturned = false;
  await page.route("**/api/exercises/context?*", async (route) => {
    const bench = new URL(route.request().url()).searchParams.get("name") === "ベンチプレス";
    if (bench) await gate;
    await route.fulfill({
      json: {
        best_weight: null,
        best_rm: null,
        previous: {
          id: "previous",
          performed_on: "2026-01-01",
          sets: [{ weight: bench ? 62.5 : 100, reps: bench ? 8 : 5 }],
        },
        memo: { content: "", revision: 0 },
      },
    });
    if (bench) benchReturned = true;
  });
  try {
    await startTraining(page);
    await page.getByRole("button", { name: "種目を変更", exact: true }).click();
    await page.getByRole("button", { name: /^スクワット/ }).click();
    const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
    await expect(weight).toHaveValue("100");
    release();
    await expect.poll(() => benchReturned).toBe(true);
    await expect(page.locator(".comparison-table")).toContainText("100");
    await expect(weight).toHaveValue("100");
    await expect(page.getByRole("spinbutton", { name: "回数", exact: true })).toHaveValue("5");
    expect(state.saves).toBe(0);
  } finally {
    release();
  }
});
