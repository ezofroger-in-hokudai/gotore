import { expect, test } from "@playwright/test";
import { mockTraining, navigate, openTraining } from "./mock-training";

test("開始せず種目を整理し、検索・分類を保って成功結果をすぐ選べる", async ({ page }) => {
  const state = await mockTraining(page);
  state.options = [
    {
      id: "bench",
      name: "ベンチプレス",
      primary_body_part: "chest",
      secondary_body_parts: ["arms"],
      revision: 1,
    },
    {
      id: "row",
      name: "ケーブルロウ",
      primary_body_part: "back",
      secondary_body_parts: ["arms"],
      revision: 1,
    },
  ];
  await page.reload();
  await navigate(page, "設定");
  await page.getByRole("button", { name: "種目を管理", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "種目一覧", exact: true });
  await expect(sheet.getByLabel("新しい種目", { exact: true })).toHaveCount(0);
  expect(state.session).toBeNull();
  let reads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/exercise-options" && request.method() === "GET")
      reads++;
  });
  await sheet
    .getByRole("group", { name: "部位で絞り込み" })
    .getByRole("button", { name: "腕", exact: true })
    .click();
  await sheet.getByRole("searchbox").fill("ロウ");
  await expect(sheet.locator(".exercise-options > li")).toHaveCount(1);
  expect(reads).toBe(0);
  await sheet.getByRole("button", { name: "ケーブルロウの部位を編集", exact: true }).click();
  await sheet.getByLabel("主な部位", { exact: true }).selectOption("shoulders");
  state.failOptions = true;
  await sheet.getByRole("button", { name: "保存", exact: true }).click();
  await expect(sheet.locator(".exercise-options")).toContainText("肩");
  await expect(sheet.getByRole("searchbox")).toHaveValue("ロウ");
  await expect(sheet.getByRole("button", { name: "腕", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await sheet.getByRole("button", { name: "種目を追加", exact: true }).click();
  await expect(sheet.getByRole("heading", { name: "種目を追加", exact: true })).toBeVisible();
  await expect(sheet.getByRole("searchbox")).toHaveCount(0);
  await sheet.getByLabel("新しい種目", { exact: true }).fill("ロウ追加");
  await sheet.getByRole("button", { name: "追加", exact: true }).click();
  await sheet.getByRole("button", { name: "すべて", exact: true }).click();
  await expect(sheet.locator(".exercise-options")).toContainText("ロウ追加");
  await sheet.getByRole("button", { name: "閉じる", exact: true }).click();
  expect(state.session).toBeNull();
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  await expect(page.locator(".exercise-picker-list")).toContainText("ロウ追加");
  expect(state.saves).toBe(0);
});

test("管理の取得失敗を再試行でき、長い名前でも削除対象の近くで確認できる", async ({ page }) => {
  const state = await mockTraining(page);
  state.failOptions = true;
  await page.reload();
  await navigate(page, "設定");
  await page.getByRole("button", { name: "種目を管理", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "種目一覧", exact: true });
  await expect(sheet.getByRole("alert")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "種目を追加", exact: true })).toHaveCount(0);
  state.failOptions = false;
  const longName = "長い名前のトレーニング種目".repeat(3);
  state.options = [
    {
      id: "long",
      name: longName,
      primary_body_part: "other",
      secondary_body_parts: [],
      revision: 1,
    },
  ];
  await sheet.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(sheet.locator(".exercise-options > li")).toHaveCount(1);
  await sheet.getByRole("button", { name: `${longName}をリストから削除`, exact: true }).click();
  const row = sheet.locator(".exercise-options > li");
  await expect(row.getByRole("group", { name: "種目リストからの削除確認" })).toContainText(
    "履歴は残ります",
  );
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({
      path: `test-results/exercise-management-${width}.png`,
      fullPage: true,
    });
  }
  state.failOptionWrite = true;
  await row.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(sheet.getByRole("alert")).toBeVisible();
  await expect(row).toContainText(longName);
  state.failOptionWrite = false;
  state.failOptions = true;
  await row.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(sheet.locator(".exercise-options > li")).toHaveCount(0);
  expect(state.session).toBeNull();
});

test("再取得中に保存した部位を遅い旧応答で戻さず、権限エラーでは一覧を消す", async ({ page }) => {
  const state = await mockTraining(page);
  state.options = [
    {
      id: "bench",
      name: "ベンチプレス",
      primary_body_part: "chest",
      secondary_body_parts: [],
      revision: 1,
    },
  ];
  await page.reload();
  await navigate(page, "設定");
  await page.getByRole("button", { name: "種目を管理", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "種目一覧", exact: true });
  await sheet.getByRole("button", { name: "ベンチプレスの部位を編集", exact: true }).click();
  await sheet.getByLabel("主な部位", { exact: true }).selectOption("back");
  state.failOptions = true;
  await sheet.getByRole("button", { name: "保存", exact: true }).click();
  await expect(sheet.getByRole("alert")).toBeVisible();
  const old = structuredClone(state.options);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  let forbidden = false;
  await page.route("**/api/exercise-options", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    if (forbidden) return route.fulfill({ status: 403, json: { detail: "閲覧できません" } });
    if (held) return route.fallback();
    held = true;
    await gate;
    await route.fulfill({ json: old });
  });
  try {
    state.failOptions = false;
    await sheet.getByRole("button", { name: "再試行", exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await sheet.getByRole("button", { name: "ベンチプレスの部位を編集", exact: true }).click();
    await sheet.getByLabel("主な部位", { exact: true }).selectOption("shoulders");
    state.failOptions = true;
    await sheet.getByRole("button", { name: "保存", exact: true }).click();
    await expect(sheet.locator(".exercise-options")).toContainText("肩");
    release();
    await expect(sheet.getByRole("alert")).toBeVisible();
    await expect(sheet.locator(".exercise-options")).toContainText("肩");
    forbidden = true;
    await sheet.getByRole("button", { name: "再試行", exact: true }).click();
    await expect(sheet.locator(".exercise-options")).toHaveCount(0);
    await expect(sheet.getByRole("alert")).toContainText("閲覧できません");
  } finally {
    release();
  }
});
