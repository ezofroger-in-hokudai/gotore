import { expect, test } from "@playwright/test";
import { mockTraining } from "./mock-training";

test("表示名の失敗・部分成功・同期再試行を区別する", async ({ page }) => {
  const state = await mockTraining(page);
  await page.getByRole("navigation").getByRole("button", { name: "設定", exact: true }).click();
  const name = page.getByLabel("表示名", { exact: true });
  await expect(name).toHaveValue("画面テスト");
  await name.fill("   ");
  await page.getByRole("button", { name: "表示名を変更", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "1〜20文字" })).toBeVisible();
  expect(state.authUpdates).toBe(0);
  state.failAuth = true;
  await name.fill("変更した名前");
  await page.getByRole("button", { name: "表示名を変更", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "表示名を変更できません" })).toBeVisible();
  await expect(name).toHaveValue("変更した名前");
  expect(state.syncs).toBe(0);
  state.failAuth = false;
  state.failSync = true;
  await page.getByRole("button", { name: "表示名を変更", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "表示名は更新済み" })).toBeVisible();
  const updates = state.authUpdates;
  state.failSync = false;
  await page.getByRole("button", { name: "共有記録への反映を再試行", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "反映を確認しました" })).toBeVisible();
  expect(state.authUpdates).toBe(updates);
  expect(state.user.user_metadata.display_name).toBe("変更した名前");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/settings-mobile.png", fullPage: true });
});

test("オーナーは名前変更を再試行でき、招待コードは変わらない", async ({ page }) => {
  const state = await mockTraining(page);
  await page.getByRole("navigation").getByRole("button", { name: "グループ", exact: true }).click();
  const name = page.getByLabel("新しいグループ名", { exact: true });
  await expect(name).toHaveValue("画面テスト部");
  await name.fill("新しいグループ");
  state.failRename = true;
  await page.getByRole("button", { name: "グループ名を変更", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "入力内容は残っています" })).toBeVisible();
  await expect(name).toHaveValue("新しいグループ");
  state.failRename = false;
  await page.getByRole("button", { name: "グループ名を変更", exact: true }).click();
  await expect(page.getByRole("heading", { name: "新しいグループ", exact: true })).toBeVisible();
  await expect(page.getByTestId("invite-code")).toHaveText("ABCDEF123456");
  await page.screenshot({ path: "test-results/group-settings-mobile.png", fullPage: true });
});

test("メンバーにはオーナーの名称変更欄を表示しない", async ({ page }) => {
  await mockTraining(page, false);
  await page.getByRole("navigation").getByRole("button", { name: "グループ", exact: true }).click();
  await expect(page.getByTestId("invite-code")).toBeVisible();
  await expect(page.getByLabel("新しいグループ名", { exact: true })).toHaveCount(0);
});

test("画面切替の一覧再取得中も、選択済みの共有先を消さない", async ({ page }) => {
  const state = await mockTraining(page);
  await expect(page.getByRole("combobox", { name: "表示するグループ", exact: true })).toHaveValue(
    state.group.id,
  );
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/groups", async (route) => {
    await pending;
    await route.fulfill({ json: [state.group] });
  });
  try {
    await page.getByRole("button", { name: "＋ トレーニングを記録", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "共有先", exact: true })).toHaveValue(
      state.group.id,
    );
    await expect(
      page.getByRole("button", { name: "記録を確定して共有 →", exact: true }),
    ).toBeEnabled();
  } finally {
    release();
  }
});

test("別の記録一覧へ切り替えたときに前の記録を流用しない", async ({ page }) => {
  const state = await mockTraining(page);
  await page.route("**/api/groups/*/workouts?*", (route) =>
    route.fulfill({
      json: [
        {
          id: "00000000-0000-0000-0000-000000000004",
          user_id: state.user.id,
          display_name: "画面テスト",
          group_id: state.group.id,
          performed_on: "2026-01-01",
          exercises: [{ name: "共有だけの記録", sets: [{ weight: 10, reps: 5 }] }],
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    }),
  );
  await page.reload();
  await expect(page.getByRole("article")).toContainText("共有だけの記録");
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workouts?*", async (route) => {
    await pending;
    await route.fulfill({ json: [] });
  });
  try {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "自分の記録", exact: true })
      .click();
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "記録を読み込んでいます" }),
    ).toBeVisible();
  } finally {
    release();
  }
});
