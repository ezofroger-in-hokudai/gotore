import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "./fixtures";
import { mockTraining, navigate, openGroup } from "./mock-training";

async function openName(page: import("@playwright/test").Page) {
  await navigate(page, "設定");
  await page.getByRole("button", { name: "表示名を編集", exact: true }).click();
}
test("表示名はAPIの値を使い、失敗・部分成功・同期再試行を区別する", async ({ page }) => {
  const state = await mockTraining(page);
  await openName(page);
  const name = page.getByRole("textbox", { name: "表示名", exact: true });
  await expect(name).toHaveValue("画面テスト");
  await name.fill("   ");
  await page.getByRole("button", { name: "決定", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("1〜20文字");
  expect(state.authUpdates).toBe(0);
  state.failAuth = true;
  await name.fill("変更した名前");
  await page.getByRole("button", { name: "決定", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("変更できません");
  state.failAuth = false;
  state.failSync = true;
  await page.getByRole("button", { name: "決定", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("表示名は更新済み");
  const updates = state.authUpdates;
  state.failSync = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "表示名", exact: true })).toHaveCount(0);
  expect(state.authUpdates).toBe(updates);
  await navigate(page, "ホーム");
  await openName(page);
  await expect(name).toHaveValue("変更した名前");
});

test("表示名はカード内で編集し、キャンセルすると元の値へ戻す", async ({ page }) => {
  await mockTraining(page);
  await openName(page);
  await expect(page.getByRole("dialog", { name: "表示名" })).toHaveCount(0);
  await expect(page.locator(".settings-name-row .group-name-inline-form")).toBeVisible();
  const name = page.getByRole("textbox", { name: "表示名", exact: true });
  await expect(name).toBeFocused();
  await name.fill("保存しない名前");
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(name).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("画面テスト");
  await openName(page);
  await expect(page.getByRole("textbox", { name: "表示名", exact: true })).toHaveValue(
    "画面テスト",
  );
});

test("プロフィール取得失敗から再試行できる", async ({ page }) => {
  await mockTraining(page);
  let fail = true;
  await page.route("**/api/me", (route) =>
    route.fulfill(
      fail
        ? { status: 503, json: { detail: "プロフィールを取得できません" } }
        : { json: { display_name: "保存済みの名前" } },
    ),
  );
  await openName(page);
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText(
    "プロフィールを取得できません",
  );
  await expect(page.getByRole("button", { name: "決定", exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "表示名", exact: true })).toHaveValue(
    "保存済みの名前",
  );
});

test("外観と触覚を端末に保持し、通知設定を表示する", async ({ page }) => {
  await mockTraining(page);
  await navigate(page, "設定");
  await expect(page.getByText("通知", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "外観" })).toHaveCount(0);
  await page.getByRole("button", { name: "ダーク", exact: true }).click();
  await expect(page.getByRole("button", { name: "ダーク", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("switch", { name: "触覚フィードバック", exact: true }).uncheck();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await navigate(page, "設定");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("switch", { name: "触覚フィードバック", exact: true }),
  ).not.toBeChecked();
  await page.screenshot({ path: "test-results/v2-settings-dark.png", fullPage: true });
});

test("狭い画面でも設定とインライン編集を横にはみ出さず操作できる", async ({ page }) => {
  await mockTraining(page);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await navigate(page, "設定");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    for (const label of ["ライト", "ダーク", "自動"]) {
      const size = await page.getByRole("button", { name: label, exact: true }).boundingBox();
      expect(size?.height).toBe(40);
    }
    await expect(page.locator(".appearance-setting")).toHaveCSS("border-bottom-width", "1px");
    await expect(page.locator(".haptic-setting")).toHaveCSS("border-bottom-width", "0px");
    const displayName = page.getByRole("button", { name: "表示名を編集", exact: true });
    await expect(displayName).not.toContainText("›");
    await displayName.click();
    await expect(page.getByRole("button", { name: "決定", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "キャンセル", exact: true })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  }
});

test("オーナーは名前変更を再試行でき、メンバーには管理欄を出さない", async ({ page }) => {
  const state = await mockTraining(page);
  await openGroup(page, "manage");
  await page.getByRole("button", { name: "グループ名を編集", exact: true }).click();
  const name = page.getByRole("textbox", { name: "グループ名", exact: true });
  await name.fill("新しいグループ");
  state.failRename = true;
  await page.getByRole("button", { name: "決定", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("通信できません");
  state.failRename = false;
  await page.getByRole("button", { name: "決定", exact: true }).click();
  await expect(page.getByRole("heading", { name: "新しいグループ", exact: true })).toBeVisible();
  expect(state.group.invite_code).toBe("ABCDEF123456");
  state.group.owner_id = "other";
  await page.reload();
  await openGroup(page, "manage");
  await expect(page.getByRole("button", { name: "グループ名を編集", exact: true })).toHaveCount(0);
});

test("設定往復と名前・画像編集で再取得待ちを増やさない", async ({ page }) => {
  await mockTraining(page);
  const reads = { profile: 0, avatar: 0 };
  let fail = false;
  for (const [path, key, data] of [
    ["/api/me", "profile", { display_name: "受信済みの名前" }],
    ["/api/me/avatar", "avatar", { version: null, data_url: null }],
  ] as const) {
    await page.route(`**${path}`, (route) => {
      reads[key]++;
      return route.fulfill(fail ? { status: 503, json: { detail: "通信失敗" } } : { json: data });
    });
  }
  await navigate(page, "設定");
  await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("受信済みの名前");
  await expect.poll(() => reads.avatar).toBe(1);
  fail = true;
  for (let index = 0; index < 3; index++) {
    await navigate(page, "ホーム");
    await navigate(page, "設定");
    await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("受信済みの名前");
  }
  await page.getByRole("button", { name: /^表示名/ }).click();
  await expect(page.getByRole("textbox", { name: "表示名", exact: true })).toHaveValue(
    "受信済みの名前",
  );
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.getByRole("button", { name: /^プロフィール画像/ }).click();
  await expect(page.getByRole("button", { name: "写真を選ぶ", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
  expect(reads).toEqual({ profile: 1, avatar: 1 });
});

test("設定の背景更新が失敗・遅延しても既知の名前と新しい保存結果を失わない", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-01T03:00:00Z"));
  const state = await mockTraining(page);
  let reads = 0;
  let mode: "normal" | "fail" | "late" = "normal";
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/me", async (route) => {
    reads++;
    if (mode === "normal") return route.fallback();
    if (mode === "fail") return route.fulfill({ status: 503, json: { detail: "背景更新失敗" } });
    await gate;
    return route.fulfill({ json: { display_name: "遅い古い名前" } });
  });
  await navigate(page, "設定");
  await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("画面テスト");
  mode = "fail";
  await navigate(page, "ホーム");
  await page.clock.setFixedTime(new Date("2026-10-01T03:01:01Z"));
  await navigate(page, "設定");
  await expect.poll(() => reads).toBe(2);
  await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("画面テスト");
  mode = "late";
  await navigate(page, "ホーム");
  await page.clock.setFixedTime(new Date("2026-10-01T03:02:02Z"));
  await navigate(page, "設定");
  await expect.poll(() => reads).toBe(3);
  await page.getByRole("button", { name: /^表示名/ }).click();
  await page.getByRole("textbox", { name: "表示名", exact: true }).fill("保存した新しい名前");
  await page.getByRole("button", { name: "決定", exact: true }).click();
  await expect.poll(() => state.syncs).toBe(1);
  await expect(page.getByRole("textbox", { name: "表示名", exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("保存した新しい名前");
  await navigate(page, "ホーム");
  await navigate(page, "設定");
  await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("保存した新しい名前");
  expect(reads).toBe(3);
});

test("ログアウト後の別ユーザーへ設定の名前・画像を持ち越さない", async ({ page }) => {
  const state = await mockTraining(page);
  let reads = 0;
  let userImage = {
    version: "first-image",
    data_url: `data:image/png;base64,${readFileSync(resolve(__dirname, "../fixtures/avatar.png")).toString("base64")}`,
  };
  await page.route("**/api/me/avatar", (route) => {
    reads++;
    return route.fulfill({ json: userImage });
  });
  await navigate(page, "設定");
  await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("画面テスト");
  await expect(page.locator(".settings-avatar-row img")).toHaveCount(1);
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page
    .getByRole("dialog", { name: "ログアウト", exact: true })
    .getByRole("button", { name: "ログアウト", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeVisible();
  state.user.id = "00000000-0000-0000-0000-000000000099";
  state.user.user_metadata.display_name = "別のユーザー";
  userImage = { version: "", data_url: "" };
  await page.evaluate(
    (id) => localStorage.setItem(`gotore:onboarding:v2:${id}`, "seen"),
    state.user.id,
  );
  await page.getByLabel("メールアドレス", { exact: true }).fill("other@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("ui-test-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await navigate(page, "設定");
  await expect(page.getByRole("button", { name: /^表示名/ })).toContainText("別のユーザー");
  await expect(page.locator(".settings-avatar-row img")).toHaveCount(0);
  expect(reads).toBe(2);
});
