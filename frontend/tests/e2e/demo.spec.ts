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
