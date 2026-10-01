import { expect, test } from "@playwright/test";
import { navigate } from "./mock-training";
for (const width of [320, 390, 430]) {
  test(`${width}px: ログインなしの実画面で大量スタンプ・開始通知・記録を操作`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const forbidden: string[] = [];
    const errors: string[] = [];
    page.on("request", (r) => {
      if (
        new URL(r.url()).pathname.startsWith("/api/") ||
        r.url().includes("/auth/v1/") ||
        r.url().includes("notification-worker.js")
      )
        forbidden.push(r.url());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      if (sessionStorage.getItem("preservation-fixture")) return;
      sessionStorage.setItem("preservation-fixture", "ready");
      localStorage.setItem(
        "sb-production-auth-token",
        JSON.stringify({ marker: "preserve-login" }),
      );
      localStorage.setItem("gotore:session-queue:v1:real-user", "preserve-record");
    });
    await page.goto("/demo");
    await expect(page.getByRole("navigation", { name: "メインナビゲーション" })).toBeVisible();
    await expect(page.locator(".community-card").first()).toContainText("ezofrogs");
    await page.getByRole("button", { name: "デモ", exact: true }).click();
    await page.getByRole("button", { name: /スタンプを20件/ }).click();
    await expect(page.locator(".activity-stamp")).toBeVisible();
    await expect(page.locator(".activity-stamp")).toContainText("20");
    await page.getByRole("button", { name: "デモ", exact: true }).click();
    await page.getByRole("button", { name: /仲間8人/ }).click();
    await expect(page.locator(".activity-start")).toContainText("8人がトレーニング開始");
    await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
    await page.getByRole("button", { name: /^ベンチプレス/ }).click();
    await expect(page.getByRole("button", { name: "セットを追加", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "セットを追加", exact: true }).click();
    await expect(page.locator(".session-screen")).toContainText("kg");
    await page.getByRole("button", { name: "デモ", exact: true }).click();
    await page.getByRole("button", { name: /スタンプを1件/ }).click();
    await expect(page.locator(".activity-stamp")).toBeVisible();
    await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
    await page.getByRole("button", { name: "終了する", exact: true }).click();
    await expect(page.getByRole("region", { name: "トレーニング結果" })).toBeVisible();
    await navigate(page, "ホーム");
    await expect(
      page.getByRole("button", { name: "トレーニングを開始", exact: true }),
    ).toBeVisible();
    await navigate(page, "履歴");
    await expect(page.locator(".personal-history-summary")).toBeVisible();
    await navigate(page, "設定");
    await expect(page.getByText("表示名", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "通知", exact: true }).click();
    await expect(page.getByRole("heading", { name: "アプリを閉じているとき" })).toHaveCount(0);
    await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
    await page.getByRole("button", { name: "デモ", exact: true }).click();
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "最初からやり直す", exact: true }).click(),
    ]);
    await expect(
      page.getByRole("button", { name: "トレーニングを開始", exact: true }),
    ).toBeVisible();
    const saved = await page.evaluate(() => [
      localStorage.getItem("sb-production-auth-token"),
      localStorage.getItem("gotore:session-queue:v1:real-user"),
    ]);
    expect(saved).toEqual([JSON.stringify({ marker: "preserve-login" }), "preserve-record"]);
    expect(forbidden).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test("名前変更・再読込・ログアウトはデモだけに反映し、端末通知を登録しない", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if ("Notification" in window)
      Object.defineProperty(Notification, "permission", { get: () => "granted" });
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = async () => {
        throw new Error("デモでPushを登録した");
      };
      navigator.serviceWorker.getRegistration = async () => {
        throw new Error("デモでPushを解除した");
      };
    }
  });
  await page.goto("/demo");
  await navigate(page, "設定");
  await page.getByRole("button", { name: /^表示名/ }).click();
  await page.getByRole("textbox", { name: "表示名", exact: true }).fill("デモ太郎");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("デモ太郎");
  await page.reload();
  await navigate(page, "設定");
  await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("デモ太郎");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await Promise.all([
    page.waitForEvent("load"),
    page
      .getByRole("dialog", { name: "ログアウト", exact: true })
      .getByRole("button", { name: "ログアウト", exact: true })
      .click(),
  ]);
  await expect(page.getByRole("button", { name: "トレーニングを開始", exact: true })).toBeVisible();
  await navigate(page, "設定");
  await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("高木透");
  expect(errors).toEqual([]);
});

test("何も押さずに大量スタンプと開始通知が届き、非表示・退出中は停止する", async ({ page }) => {
  await page.clock.install();
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "トレーニングを開始", exact: true })).toBeVisible();
  await page.clock.runFor(4_100);
  await expect(page.locator(".activity-stamp")).toBeVisible();
  await page.clock.runFor(8_000);
  await expect(page.locator(".activity-start")).toBeVisible();
  const sequence = () =>
    page.evaluate(
      () => JSON.parse(sessionStorage.getItem("egotore:demo:v1") || "{}").sequence as number,
    );
  const firstSequence = await sequence();
  await page.clock.runFor(40_000);
  expect(await sequence()).toBeGreaterThan(firstSequence);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenSequence = await sequence();
  await page.clock.runFor(60_000);
  expect(await sequence()).toBe(hiddenSequence);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(4_100);
  expect(await sequence()).toBeGreaterThan(hiddenSequence);
  const exitSequence = await sequence();
  await page.goto("/");
  await page.clock.runFor(60_000);
  expect(await sequence()).toBe(exitSequence);
});

test("デモの時計はホームと再読込で計時を引き継ぎ、開始通知をホームまで保留", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-02T03:00:00Z") });
  await page.goto("/demo");
  const clock = page.getByTestId("floating-training");
  await expect(clock).toHaveText("START");
  await clock.click();
  await page.getByRole("button", { name: /^ベンチプレス/ }).click();
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect(clock.locator(".floating-training-action")).toContainText("終了");
  await expect(page.locator(".session-header .finish-training")).toHaveCount(0);
  await page.getByRole("button", { name: "デモ", exact: true }).click();
  await page.getByRole("button", { name: /仲間8人/ }).click();
  await page.clock.runFor(1000);
  await expect(page.locator(".activity-start")).toHaveCount(0);
  await navigate(page, "ホーム");
  await expect(page.locator(".activity-start")).toContainText("8人がトレーニング開始");
  await expect(clock.locator(".floating-training-action")).toHaveText("記録へ");
  await page.clock.fastForward(65 * 60_000);
  await expect(clock.locator(".floating-training-elapsed")).toHaveText("1:05");
  await page.reload();
  await expect(page.locator(".community-card").first()).toContainText("ezofrogs");
  await expect(clock.locator(".floating-training-action")).toHaveText("記録へ");
  await expect(clock.locator(".floating-training-elapsed")).toHaveText("1:05");
  await clock.click();
  await expect(page.locator(".session-screen")).toContainText("kg");
  await clock.click();
  await expect(page.getByRole("dialog", { name: "トレーニング終了" })).toBeVisible();
});

for (const group of [false, true]) {
  test(`デモの${group ? "グループ" : "個人"}カレンダーも隣月と並んで滑る`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-02T03:00:00Z"));
    await page.goto("/demo");
    await expect(page.getByTestId("floating-training")).toHaveText("START");
    if (group) {
      await page.locator(".community-card").first().click();
      await page
        .getByRole("navigation", { name: "グループの表示" })
        .getByRole("button", { name: "カレンダー" })
        .click();
    } else await navigate(page, "履歴");
    const calendar = page.locator(".personal-history-calendar:visible");
    const viewport = calendar.locator(".history-calendar-viewport");
    await expect(calendar.locator(".personal-history-month strong")).toHaveText("2026年10月");
    await expect(calendar.locator(".personal-history-days button").first()).toBeEnabled();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.gotoreNavigationDirection))
      .toBeUndefined();
    const box = await viewport.boundingBox();
    if (!box) throw new Error("デモのカレンダーがありません");
    const x = box.x + box.width * 0.4;
    const y = box.y + box.height * 0.4;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 90, y, { steps: 6 });
    await expect(calendar.locator(".history-calendar-page")).toHaveCount(3);
    const offset = await calendar
      .locator(".history-calendar-track")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    expect(offset).toBeGreaterThan(-box.width + 70);
    if (!group) await page.screenshot({ path: "test-results/demo-calendar-drag.png" });
    await page.mouse.up();
    await expect(calendar).toHaveAttribute("data-moving", "false");
    await expect(calendar.locator(".personal-history-month strong")).toHaveText("2026年9月");
    await expect(calendar.locator(".personal-history-days > *")).toHaveCount(42);
    if (!group) await page.screenshot({ path: "test-results/demo-calendar.png" });
    await calendar.getByRole("button", { name: /^2026年9月29日、/ }).click();
    await expect(page.getByRole("dialog")).toContainText("ベンチプレス");
  });
}

test("デモのスタンプも上へスライドして閉じる", async ({ page }) => {
  await page.clock.install();
  await page.goto("/demo");
  await expect(page.getByTestId("floating-training")).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.getByRole("button", { name: "デモ", exact: true }).click();
  await page.getByRole("button", { name: /スタンプを20件/ }).click();
  await page.clock.runFor(350);
  const stamp = page.locator(".activity-stamp");
  await expect(stamp).toContainText("20件のスタンプ");
  await stamp.getByRole("button", { name: "スタンプ通知を閉じる" }).focus();
  await page.keyboard.press("Escape");
  await expect(stamp).toHaveAttribute("data-leaving", "true");
  expect(await stamp.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "notification-stamp-exit",
  );
  await page.clock.runFor(180);
  await expect(stamp).toHaveCount(0);
});
