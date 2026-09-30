import { expect, test } from "./fixtures";
import { mockTraining, navigate, openTraining, startTraining } from "./mock-training";

test("画面を閉じている間の自動終了を復帰時に知らせる", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  const active = state.session;
  expect(active).not.toBeNull();
  if (!active) return;
  const last = new Date(Date.now() - 61 * 60_000).toISOString();
  state.finished.push({ ...active, last_activity_at: last, ended_at: last, auto_ended: true });
  state.session = null;
  await page.reload();
  await expect(
    page.getByText("操作が1時間なかったため、トレーニングを自動終了しました。", { exact: false }),
  ).toBeVisible();
  await openTraining(page);
  await expect(page.getByRole("button", { name: "トレーニングを開始", exact: true })).toBeEnabled();
});

test("自動終了の照合失敗は表示せず端末記録を保持して自動復帰する", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  const active = state.session;
  expect(active).not.toBeNull();
  if (!active) return;
  const last = new Date(Date.now() - 61 * 60_000).toISOString();
  const key = `gotore:session-queue:v1:${state.user.id}`;
  await page.evaluate(
    ({ key, last }) => {
      const record = JSON.parse(localStorage.getItem(key) || "null");
      record.base.last_activity_at = last;
      record.lastActivityAt = undefined;
      record.activityTrail = undefined;
      localStorage.setItem(key, JSON.stringify(record));
    },
    { key, last },
  );
  state.session = null;
  state.finished.push({ ...active, last_activity_at: last, ended_at: last, auto_ended: true });
  let fail = true;
  await page.route("**/api/sessions/active", (route) =>
    fail ? route.abort() : route.fulfill({ json: state.session }),
  );
  await page.reload();
  await expect(page.getByTestId("floating-training")).toBeDisabled();
  await expect(page.getByRole("button", { name: "終了状態を確認する" })).toHaveCount(0);
  await expect(page.getByText("前のトレーニングの終了状態を確認", { exact: false })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).not.toBeNull();
  fail = false;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByTestId("floating-training")).toBeEnabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
});

test("トレーニング終了の確定後は次のSTARTを押せる", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect.poll(() => state.saves).toBe(1);
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  await page.getByRole("button", { name: "終了する", exact: true }).click();
  await expect(page.getByRole("region", { name: "トレーニング結果" })).toContainText("保存済み");
  await page
    .getByRole("region", { name: "トレーニング結果" })
    .getByRole("button", { name: "ホーム" })
    .click();
  const start = page.getByRole("button", { name: "トレーニングを開始", exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByRole("button", { name: "トレーニング終了", exact: true })).toBeVisible();
});

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
