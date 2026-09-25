import { expect, test } from "@playwright/test";
import { mockTraining, openTraining } from "./mock-training";

test("種目選択は仲間の取得を待たず、部位で候補を絞り込める", async ({ page }) => {
  const state = await mockTraining(page);
  state.options = [
    {
      id: "option-bench",
      name: "ベンチプレス",
      primary_body_part: "chest",
      secondary_body_parts: ["arms"],
    },
    {
      id: "option-squat",
      name: "スクワット",
      primary_body_part: "legs",
      secondary_body_parts: [],
    },
  ];
  await page.route("**/api/groups/today-activity", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await route.fulfill({ json: { groups: [] } });
  });

  // mockTrainingの初期表示後に候補を差し替えるため、選択画面を開く前に再取得する。
  await page.reload();
  await openTraining(page);
  await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();

  await expect(page.getByRole("heading", { name: "種目を選択", exact: true })).toBeVisible();
  const centeredExercise = page.getByRole("button", { name: /^ベンチプレス/ });
  expect(
    await centeredExercise.evaluate((button) => {
      const row = button.getBoundingClientRect();
      const title = button.querySelector("strong")?.getBoundingClientRect();
      return title
        ? Math.abs(title.top + title.height / 2 - (row.top + row.height / 2))
        : Number.POSITIVE_INFINITY;
    }),
  ).toBeLessThanOrEqual(1);
  const peers = page.getByRole("region", { name: "今日の仲間", exact: true });
  const today = page.getByRole("group", { name: "今日のトレーニング", exact: true });
  expect((await peers.boundingBox())?.y).toBeLessThan((await today.boundingBox())?.y ?? 0);
  await expect(centeredExercise).toBeVisible();
  await page.getByRole("button", { name: "脚", exact: true }).click();
  await expect(page.getByRole("button", { name: /^スクワット/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^ベンチプレス/ })).toHaveCount(0);
  const selectedPart = page.getByRole("button", { name: "脚", exact: true });
  await expect(selectedPart).toHaveCSS("border-top-style", "solid");
  await expect(selectedPart).toHaveCSS("background-color", "rgb(255, 245, 245)");
  await page.getByRole("button", { name: "＋ 種目を追加", exact: true }).click();
  const addSheet = page.getByRole("dialog", { name: "種目を追加", exact: true });
  await expect(addSheet.getByLabel("新しい種目", { exact: true })).toBeVisible();
  await expect(addSheet.getByRole("heading", { name: "種目を追加", exact: true })).toHaveCount(1);
  await expect(addSheet.getByRole("searchbox")).toHaveCount(0);
  await addSheet.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("button", { name: "トレーニング終了", exact: true })).toBeVisible();
  const selectingFinish = await page
    .getByRole("button", { name: "トレーニング終了", exact: true })
    .evaluate((button) => {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        background: style.backgroundColor,
        color: style.color,
        radius: style.borderRadius,
      };
    });
  await page.getByRole("button", { name: /^スクワット/ }).click();
  const recordingFinish = await page
    .getByRole("button", { name: "トレーニング終了", exact: true })
    .evaluate((button) => {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        background: style.backgroundColor,
        color: style.color,
        radius: style.borderRadius,
      };
    });
  expect(recordingFinish).toEqual(selectingFinish);
});
