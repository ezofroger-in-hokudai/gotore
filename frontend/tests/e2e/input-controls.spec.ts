import { expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

test("矢印は重量1kg・回数1回ずつ調整し、保存せず上下限を守る", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
  const reps = page.getByRole("spinbutton", { name: "回数", exact: true });
  const moreWeight = page.getByRole("button", { name: "重量を増やす", exact: true });
  const lessWeight = page.getByRole("button", { name: "重量を減らす", exact: true });
  await weight.fill("77.5");
  await moreWeight.click();
  await expect(weight).toHaveValue("78.5");
  await expect(moreWeight.locator(".wheel-arrow")).toBeVisible();
  await lessWeight.click();
  await expect(weight).toHaveValue("77.5");
  await reps.fill("8");
  await page.getByRole("button", { name: "回数を増やす", exact: true }).click();
  await expect(reps).toHaveValue("9");
  await page.getByRole("button", { name: "回数を減らす", exact: true }).click();
  await expect(reps).toHaveValue("8");
  await weight.fill("0");
  await expect(lessWeight).toBeDisabled();
  await weight.fill("999.5");
  await moreWeight.click();
  await expect(weight).toHaveValue("1000");
  await expect(moreWeight).toBeDisabled();
  await reps.fill("1");
  await expect(page.getByRole("button", { name: "回数を減らす", exact: true })).toBeDisabled();
  await reps.fill("1000");
  await expect(page.getByRole("button", { name: "回数を増やす", exact: true })).toBeDisabled();
  expect(state.saves).toBe(0);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(moreWeight).toBeInViewport();
    await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test("回数Enterは追加と編集を保存ボタンと同じく確定し、無効値や長押しでは保存しない", async ({
  page,
}) => {
  const state = await mockTraining(page);
  await startTraining(page);
  const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
  const reps = page.getByRole("spinbutton", { name: "回数", exact: true });
  await weight.fill("77.5");
  for (const value of ["", "0", "1001", "1.5"]) {
    await reps.fill(value);
    await reps.press("Enter");
  }
  expect(state.saves).toBe(0);
  await reps.fill("8");
  await reps.press("Enter");
  await expect.poll(() => state.saves).toBe(1);
  expect(state.session?.exercises[0].sets).toEqual([{ weight: 77.5, reps: 8 }]);
  for (const extra of [{ repeat: true }, { isComposing: true }]) {
    await reps.evaluate(
      (element, extra) =>
        element.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...extra }),
        ),
      extra,
    );
  }
  expect(state.saves).toBe(1);
  await page.getByRole("button", { name: "セット1を編集", exact: true }).click();
  await reps.fill("9");
  await reps.press("Enter");
  await expect.poll(() => state.saves).toBe(2);
  expect(state.session?.exercises[0].sets).toEqual([{ weight: 77.5, reps: 9 }]);
});
