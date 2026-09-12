import { expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

test("記録済み種目から1タップで復帰し、未保存入力は確認なしに捨てない", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("60");
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
  const overview = page.getByRole("region", { name: "今回のトレーニング" });
  await expect(overview.getByRole("button", { name: "ベンチプレスの記録に戻る" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(overview.getByText("全セットを見る", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^スクワット/ }).click();
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("80");
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("82.5");
  await page.getByRole("button", { name: "種目を変更", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await overview.getByRole("button", { name: "ベンチプレスの記録に戻る" }).click();
  await expect(overview).toBeVisible();
  await overview.getByRole("button", { name: "スクワットの記録に戻る" }).click();
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("82.5");
  await page.getByRole("button", { name: "種目を変更", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await overview.getByRole("button", { name: "ベンチプレスの記録に戻る" }).click();
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toHaveValue("60");
  await page.getByRole("button", { name: "セット1を編集", exact: true }).click();
  await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("9");
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect.poll(() => state.session?.exercises[0].sets.length).toBe(2);
  expect(state.session?.exercises[1].sets).toEqual([{ weight: 80, reps: 10 }]);
});
