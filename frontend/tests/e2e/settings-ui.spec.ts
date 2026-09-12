import { expect, test } from "@playwright/test";
import { mockTraining, navigate, openGroup } from "./mock-training";

async function openName(page: import("@playwright/test").Page) {
  await navigate(page, "設定");
  await page.getByRole("button", { name: /^表示名/ }).click();
}
test("表示名はAPIの値を使い、失敗・部分成功・同期再試行を区別する", async ({ page }) => {
  const state = await mockTraining(page);
  await openName(page);
  const name = page.getByRole("textbox", { name: "表示名", exact: true });
  await expect(name).toHaveValue("画面テスト");
  await name.fill("   ");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("1〜20文字");
  expect(state.authUpdates).toBe(0);
  state.failAuth = true;
  await name.fill("変更した名前");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("変更できません");
  state.failAuth = false;
  state.failSync = true;
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("表示名は更新済み");
  const updates = state.authUpdates;
  state.failSync = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "反映しました" })).toBeVisible();
  expect(state.authUpdates).toBe(updates);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await navigate(page, "ホーム");
  await openName(page);
  await expect(name).toHaveValue("変更した名前");
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
  await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "表示名", exact: true })).toHaveValue(
    "保存済みの名前",
  );
});

test("外観と触覚を端末に保持し、未提供の通知項目を省く", async ({ page }) => {
  await mockTraining(page);
  await navigate(page, "設定");
  await expect(page.getByText("通知", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^外観/ }).click();
  await page.getByRole("button", { name: "ダーク", exact: true }).click();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: /^触覚フィードバック/ }).click();
  await page.getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.reload();
  await navigate(page, "設定");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: /^触覚フィードバック/ })).toContainText("オフ");
  await page.screenshot({ path: "test-results/v2-settings-dark.png", fullPage: true });
});

test("オーナーは名前変更を再試行でき、メンバーには管理欄を出さない", async ({ page }) => {
  const state = await mockTraining(page);
  await openGroup(page, "manage");
  const name = page.getByLabel("変更後の名前", { exact: true });
  await name.fill("新しいグループ");
  state.failRename = true;
  await page.getByRole("button", { name: "変更する", exact: true }).click();
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("通信できません");
  state.failRename = false;
  await page.getByRole("button", { name: "変更する", exact: true }).click();
  await expect(page.getByRole("heading", { name: "新しいグループ", exact: true })).toBeVisible();
  expect(state.group.invite_code).toBe("ABCDEF123456");
  state.group.owner_id = "other";
  await page.reload();
  await openGroup(page);
  await expect(page.getByLabel("変更後の名前", { exact: true })).toHaveCount(0);
});
