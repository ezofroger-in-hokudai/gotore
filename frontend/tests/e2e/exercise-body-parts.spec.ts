import type { ExerciseOption } from "../../src/lib/api";
import { expect, test } from "./fixtures";
import { openRecordingCatalog } from "./mock-training";
import { mockTraining, navigate, openTraining, startTraining } from "./mock-training";

const classified: ExerciseOption[] = [
  {
    id: "option-bench",
    name: "ベンチプレス",
    primary_body_part: "chest",
    secondary_body_parts: ["shoulders", "arms"],
    revision: 1,
  },
  {
    id: "option-squat",
    name: "スクワット",
    primary_body_part: "legs",
    secondary_body_parts: ["glutes"],
    revision: 1,
  },
  {
    id: "option-fly",
    name: "ペックフライ",
    primary_body_part: "chest",
    secondary_body_parts: ["shoulders"],
    revision: 1,
  },
  {
    id: "option-pull",
    name: "ラットプルダウン",
    primary_body_part: "back",
    secondary_body_parts: ["arms"],
    revision: 1,
  },
  { id: "option-old", name: "自分の種目" },
];

async function prepare(page: import("@playwright/test").Page) {
  const state = await mockTraining(page, true, false, false);
  state.options = structuredClone(classified);
  await page.reload();
  return state;
}

test("記録の部位選択は主部位の和集合を通信なしで絞り込む", async ({ page }) => {
  await prepare(page);
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  const filters = page.locator(".session-body-parts");
  const list = page.locator(".exercise-picker-list");
  await expect(list.getByRole("button")).toHaveCount(5);
  let reads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/exercise-options") reads++;
  });
  await filters.getByRole("button", { name: "胸", exact: true }).click();
  await expect(list.getByRole("button")).toHaveCount(2);
  await filters.getByRole("button", { name: "背中", exact: true }).click();
  await expect(list.getByRole("button")).toHaveCount(3);
  await filters.getByRole("button", { name: "胸", exact: true }).click();
  await filters.getByRole("button", { name: "背中", exact: true }).click();
  await filters.getByRole("button", { name: "その他", exact: true }).click();
  await expect(list.getByRole("button")).toHaveCount(1);
  await expect(list).toContainText("自分の種目");
  await filters.getByRole("button", { name: "その他", exact: true }).click();
  await filters.getByRole("button", { name: "胸", exact: true }).click();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(filters.getByRole("button", { name: "胸", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  expect(reads).toBe(0);
  await list.getByRole("button", { name: /^ベンチプレス/ }).click();
  await expect(page.locator(".exercise-information")).toHaveText("ベンチプレス");
});

test("部位を付けて追加し、保存失敗と競合では入力を保持して最新の分類から編集し直せる", async ({
  page,
}) => {
  const state = await prepare(page);
  await navigate(page, "設定");
  await page.getByRole("button", { name: "種目を管理", exact: true }).click();
  await page.getByRole("button", { name: "種目を追加", exact: true }).click();
  await page.getByLabel("新しい種目", { exact: true }).fill("ケーブルロウ");
  await page.getByLabel("主な部位", { exact: true }).selectOption("back");
  await page.locator(".secondary-parts > summary").click();
  await page
    .getByRole("group", { name: "補助部位", exact: true })
    .getByRole("button", { name: "腕", exact: true })
    .click();
  state.failOptionWrite = true;
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("通信できません");
  await expect(page.getByLabel("主な部位", { exact: true })).toHaveValue("back");
  state.failOptionWrite = false;
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.locator(".exercise-options")).toContainText("ケーブルロウ");
  const created = state.options.find((option) => option.name === "ケーブルロウ");
  expect(created).toMatchObject({ primary_body_part: "back", secondary_body_parts: ["arms"] });
  await page.getByRole("button", { name: "ケーブルロウの部位を編集", exact: true }).click();
  await page.getByLabel("主な部位", { exact: true }).selectOption("shoulders");
  await page.screenshot({ path: "test-results/body-parts-edit-390.png", fullPage: true });
  state.failOptionWrite = true;
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("通信できません");
  await expect(page.getByLabel("主な部位", { exact: true })).toHaveValue("shoulders");
  state.failOptionWrite = false;
  if (!created) throw new Error("追加した種目がありません");
  Object.assign(created, {
    primary_body_part: "legs",
    secondary_body_parts: ["glutes"],
    revision: 2,
  });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("別の更新");
  await expect(page.getByLabel("主な部位", { exact: true })).toHaveValue("shoulders");
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "最新の部位を読み直す", exact: true }).click();
  await expect(page.getByLabel("主な部位", { exact: true })).toHaveValue("legs");
  await page.getByLabel("主な部位", { exact: true }).selectOption("back");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("部位を保存しました");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.reload();
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
  await page
    .locator(".session-body-parts")
    .getByRole("button", { name: "背中", exact: true })
    .click();
  await expect(page.locator(".exercise-picker-list")).toContainText("ケーブルロウ");
});

test("今回の種目に戻れて、未保存入力の保護と削除済み種目の選択を維持する", async ({ page }) => {
  const state = await prepare(page);
  await startTraining(page);
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect.poll(() => state.session?.exercises[0]?.sets.length).toBe(1);
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  await page
    .locator(".exercise-picker-list")
    .getByRole("button", { name: /^スクワット/ })
    .click();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("95");
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .locator(".exercise-picker-list")
    .getByRole("button", { name: /^ベンチプレス/ })
    .click();
  await expect(page.locator(".exercise-picker-list")).toBeVisible();
  await page
    .locator(".exercise-picker-list")
    .getByRole("button", { name: /^スクワット/ })
    .click();
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("95");
  state.options = state.options.filter((option) => option.name !== "ベンチプレス");
  await page.reload();
  await openTraining(page);
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  await page
    .locator(".session-body-parts")
    .getByRole("button", { name: "その他", exact: true })
    .click();
  await expect(page.locator(".exercise-picker-list")).toContainText("ベンチプレス");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator(".exercise-picker-list")
    .getByRole("button", { name: /^ベンチプレス/ })
    .click();
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("80");
  expect(state.session?.exercises).toHaveLength(1);
});

test("種目一覧の再取得に失敗しても、読み込んだ候補で部位を切り替えられる", async ({ page }) => {
  const state = await prepare(page);
  await startTraining(page);
  await openRecordingCatalog(page);
  await page.getByLabel("新しい種目", { exact: true }).fill("追加種目");
  state.failOptions = true;
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.locator(".exercise-picker-list")).toContainText("追加種目");
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("通信できません");
  await page
    .locator(".session-body-parts")
    .getByRole("button", { name: "胸", exact: true })
    .click();
  await expect(page.locator(".exercise-picker-list").getByRole("button")).toHaveCount(2);
  state.failOptions = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await page
    .locator(".session-body-parts")
    .getByRole("button", { name: "その他", exact: true })
    .click();
  await expect(page.locator(".exercise-picker-list")).toContainText("追加種目");
});
