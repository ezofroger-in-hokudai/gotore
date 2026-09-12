import { expect, test } from "@playwright/test";
import { mockTraining, navigate, openTraining, startTraining } from "./mock-training";

for (const resume of [false, true]) {
  test(`初回復元失敗からオンラインで${resume ? "同じセッションを再開" : "開始可能に復帰"}し、多重取得しない`, async ({
    page,
  }) => {
    const state = await mockTraining(page);
    if (resume) await startTraining(page);
    const id = state.session?.id;
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("gotore:session-queue:")) localStorage.removeItem(key);
      }
    });
    let fail = true;
    let loads = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/sessions/active", async (route) => {
      loads++;
      if (fail) return route.abort();
      await gate;
      return route.fulfill({ json: state.session });
    });
    await page.reload();
    await openTraining(page);
    await expect(
      page.getByRole("button", { name: "トレーニングを開始", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("alert").filter({ hasText: "通信できません" })).toBeVisible();
    const failedLoads = loads;
    fail = false;
    try {
      await page.evaluate(() => {
        for (let i = 0; i < 3; i++) window.dispatchEvent(new Event("online"));
      });
      await expect.poll(() => loads).toBe(failedLoads + 1);
      await page.waitForTimeout(200);
      expect(loads).toBe(failedLoads + 1);
      release();
      if (resume) {
        await page.getByRole("button", { name: "トレーニングを再開", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "トレーニング終了", exact: true }),
        ).toBeVisible();
        expect(state.session?.id).toBe(id);
      } else {
        await expect(
          page.getByRole("button", { name: "トレーニングを開始", exact: true }),
        ).toBeEnabled();
        expect(state.session).toBeNull();
      }
    } finally {
      release();
    }
  });
}

test("初回復元の再試行は非表示中に止まり、表示復帰と定期処理で回復する", async ({ page }) => {
  await page.clock.install();
  await mockTraining(page);
  let loads = 0;
  let fail = true;
  await page.route("**/api/sessions/active", (route) => {
    loads++;
    return fail ? route.abort() : route.fulfill({ json: null });
  });
  await page.reload();
  await openTraining(page);
  await expect(page.getByRole("alert").filter({ hasText: "通信できません" })).toBeVisible();
  const before = loads;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
  });
  await page.clock.runFor(5500);
  expect(loads).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => loads).toBe(before + 1);
  await expect(page.getByRole("alert").filter({ hasText: "通信できません" })).toBeVisible();
  fail = false;
  await page.clock.runFor(5500);
  await expect(page.getByRole("button", { name: "トレーニングを開始", exact: true })).toBeEnabled();
});

test("壊れた送信待ちデータを通信復帰で消さない", async ({ page }) => {
  const state = await mockTraining(page);
  const key = `gotore:session-queue:v1:${state.user.id}`;
  const broken = "{broken-pending";
  await page.evaluate(({ key, broken }) => localStorage.setItem(key, broken), {
    key,
    broken,
  });
  let loads = 0;
  await page.route("**/api/sessions/active", (route) => {
    loads++;
    return route.fulfill({ json: null });
  });
  await page.reload();
  await openTraining(page);
  await expect(
    page.getByRole("button", { name: "トレーニングを開始", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(200);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(broken);
  expect(loads).toBe(0);
  expect(state.saves).toBe(0);
});
