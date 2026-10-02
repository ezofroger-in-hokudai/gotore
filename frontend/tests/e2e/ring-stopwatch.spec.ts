import { expect, test } from "./fixtures";
import { mockTraining, navigate } from "./mock-training";

for (const width of [320, 390, 430])
  test(`${width}px: START・計時・ホーム復帰・終了をリング付きの時計に統合`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.install();
    const state = await mockTraining(page);
    const watch = page.getByTestId("floating-training");
    await expect(watch.locator(".floating-training-elapsed")).toHaveText("START");
    await expect(watch).not.toContainText("▶");
    const ring = () =>
      watch
        .locator(".floating-training-dial")
        .evaluate((el) => getComputedStyle(el, "::after").borderTopWidth);
    expect(await ring()).toBe("1px");
    await watch.click();
    await expect(page.locator(".session-header .finish-training")).toHaveCount(0);
    await expect(page.locator(".session-header .session-elapsed")).toHaveCount(0);
    await expect(watch).toHaveAccessibleName("トレーニング終了");
    await expect(watch.locator(".floating-training-elapsed")).toHaveText("0:00");
    expect(await ring()).toBe("1px");
    await page.getByRole("button", { name: /^ベンチプレス/ }).click();
    await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("62.5");
    const watchBox = await watch.boundingBox();
    const dockBox = await page.locator(".recording-entry-dock").boundingBox();
    expect((watchBox?.y ?? 0) + (watchBox?.height ?? 0)).toBeLessThan(dockBox?.y ?? 0);
    const sessionId = state.session?.id;
    await navigate(page, "ホーム");
    await expect(watch.locator(".floating-training-action")).toHaveText("記録へ");
    await page.clock.fastForward(60000);
    await expect(watch.locator(".floating-training-elapsed")).toHaveText("0:01");
    if (state.session) state.session.started_at = new Date(Date.now() - 71 * 60000).toISOString();
    await page.reload();
    await expect(watch.locator(".floating-training-elapsed")).toHaveText("1:12");
    await page.reload();
    await expect(page.getByRole("heading", { name: "みんなのトレーニング" })).toBeVisible();
    await expect(watch.locator(".floating-training-elapsed")).toHaveText("1:12");
    await watch.click();
    await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("62.5");
    expect(state.session?.id).toBe(sessionId);
    await watch.click();
    const dialog = page.getByRole("dialog", { name: "トレーニング終了", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "トレーニングに戻る" }).click();
    await expect(watch).toBeVisible();
    await watch.click();
    await dialog.getByRole("button", { name: "終了する", exact: true }).click();
    await expect(page.getByRole("region", { name: "トレーニング結果" })).toBeVisible();
    await expect(watch).toHaveCount(0);
    await navigate(page, "ホーム");
    await expect(watch.locator(".floating-training-elapsed")).toHaveText("START");
  });

test("秒の点は進み、動き低減と画面復帰で開始時刻へ合わせる", async ({ page }) => {
  const state = await mockTraining(page);
  const watch = page.getByTestId("floating-training");
  await watch.click();
  const point = watch.locator(".floating-training-orbit");
  await expect(point).toBeVisible();
  const time = () => point.evaluate((el) => Number(el.getAnimations()[0]?.currentTime));
  const before = await time();
  await expect.poll(time).toBeGreaterThan(before + 200);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => point.evaluate((el) => el.getAnimations()[0]?.playState)).toBe("paused");
  const stopped = await time();
  await page.waitForTimeout(150);
  expect(await time()).toBe(stopped);
  if (state.session) state.session.started_at = new Date(Date.now() - 45000).toISOString();
  await page.reload();
  await expect(point).toBeVisible();
  expect(await time()).toBeGreaterThan(44000);
  expect(await time()).toBeLessThan(48000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => point.evaluate((el) => el.getAnimations()[0]?.playState)).toBe("running");
});

test("時計をフォーム内へ動かしても終了せず、画面往復と再起動で位置を保つ", async ({ page }) => {
  await mockTraining(page);
  const watch = page.getByTestId("floating-training");
  await watch.click();
  await page.getByRole("button", { name: /^ベンチプレス/ }).click();
  const initial = await watch.boundingBox();
  const dock = await page.locator(".recording-entry-dock").boundingBox();
  if (!initial || !dock) throw new Error("時計か入力フォームがありません");
  const target = dock.y + 28;
  await page.mouse.move(initial.x + 36, initial.y + 40);
  await page.mouse.down();
  await page.mouse.move(initial.x + 36, target + 40, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await watch.boundingBox())?.y).toBeCloseTo(target, 0);
  await navigate(page, "ホーム");
  expect((await watch.boundingBox())?.y).toBeCloseTo(target, 0);
  await page.reload();
  await watch.click();
  await expect(page.getByRole("button", { name: "セットを追加", exact: true })).toBeVisible();
  expect((await watch.boundingBox())?.y).toBeCloseTo(target, 0);
  await watch.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "トレーニング終了", exact: true })).toBeVisible();
});
