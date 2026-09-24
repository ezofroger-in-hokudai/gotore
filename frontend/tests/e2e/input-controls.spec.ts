import { expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

test("矢印は重量5kg・回数5回ずつ調整し、保存せず上下限を守る", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
  const reps = page.getByRole("spinbutton", { name: "回数", exact: true });
  const moreWeight = page.getByRole("button", { name: "重量を5kg増やす", exact: true });
  const lessWeight = page.getByRole("button", { name: "重量を5kg減らす", exact: true });
  for (const [field, label] of [
    [weight, "重量"],
    [reps, "回数"],
  ] as const) {
    await moreWeight.focus();
    const labelBox = await page
      .locator(".set-entry-labels .number-wheel-label")
      .filter({ hasText: label })
      .boundingBox();
    if (!labelBox) throw new Error(`${label}の見出しがありません`);
    await page.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
    await expect(field).not.toBeFocused();
  }
  await weight.fill("77.5");
  await moreWeight.click();
  await expect(weight).toHaveValue("82.5");
  await expect(moreWeight.locator(".wheel-arrow")).toBeVisible();
  const upArrow = moreWeight.locator(".wheel-arrow-svg");
  const downArrow = lessWeight.locator(".wheel-arrow-svg");
  await expect(upArrow).toHaveAttribute("viewBox", "0 0 12 8");
  await expect(downArrow).toHaveAttribute("viewBox", "0 0 12 8");
  await expect(upArrow).toHaveAttribute("width", "14");
  await expect(downArrow).toHaveAttribute("width", "14");
  await expect(upArrow).toHaveAttribute("height", "10");
  await expect(downArrow).toHaveAttribute("height", "10");
  await expect(upArrow).not.toHaveClass(/wheel-arrow-svg-down/);
  await expect(downArrow).toHaveClass(/wheel-arrow-svg-down/);
  const [moreBox, inputBox, lessBox] = await Promise.all([
    moreWeight.boundingBox(),
    weight.boundingBox(),
    lessWeight.boundingBox(),
  ]);
  if (!moreBox || !inputBox || !lessBox) throw new Error("重量の操作欄がありません");
  const [weightLabelBox, repsLabelBox, repsBox, rmBox] = await Promise.all([
    page.locator(".set-entry-labels .number-wheel-label").filter({ hasText: "重量" }).boundingBox(),
    page.locator(".set-entry-labels .number-wheel-label").filter({ hasText: "回数" }).boundingBox(),
    reps.boundingBox(),
    page.locator(".wheels .rm-estimate").boundingBox(),
  ]);
  if (!weightLabelBox || !repsLabelBox || !repsBox || !rmBox) {
    throw new Error("入力欄の見出しまたはRM表示がありません");
  }
  expect(
    Math.abs(weightLabelBox.x + weightLabelBox.width / 2 - (inputBox.x + inputBox.width / 2)),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(repsLabelBox.x + repsLabelBox.width / 2 - (repsBox.x + repsBox.width / 2)),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(rmBox.y + rmBox.height / 2 - (moreBox.y + moreBox.height / 2)),
  ).toBeLessThanOrEqual(1);
  const inputCenter = (inputBox.x + inputBox.width / 2 + repsBox.x + repsBox.width / 2) / 2;
  expect(Math.abs(rmBox.x + rmBox.width / 2 - inputCenter)).toBeLessThanOrEqual(1);
  expect(moreBox.height).toBeGreaterThanOrEqual(24);
  const upperGap = inputBox.y - (moreBox.y + moreBox.height);
  const lowerGap = lessBox.y - (inputBox.y + inputBox.height);
  expect(upperGap).toBeGreaterThanOrEqual(7);
  expect(Math.abs(upperGap - lowerGap)).toBeLessThanOrEqual(1);
  await lessWeight.click();
  await expect(weight).toHaveValue("77.5");
  await reps.fill("8");
  await page.getByRole("button", { name: "回数を5回増やす", exact: true }).click();
  await expect(reps).toHaveValue("13");
  await page.getByRole("button", { name: "回数を5回減らす", exact: true }).click();
  await expect(reps).toHaveValue("8");
  await weight.fill("0");
  await expect(lessWeight).toBeDisabled();
  await weight.fill("999.5");
  await moreWeight.click();
  await expect(weight).toHaveValue("1000");
  await expect(moreWeight).toBeDisabled();
  await reps.fill("1");
  await expect(page.getByRole("button", { name: "回数を5回減らす", exact: true })).toBeDisabled();
  await reps.fill("1000");
  await expect(page.getByRole("button", { name: "回数を5回増やす", exact: true })).toBeDisabled();
  expect(state.saves).toBe(0);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(moreWeight).toBeInViewport();
    await expect(page.getByRole("button", { name: "セットを追加", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole("button", { name: "入力欄をしまう", exact: true }).click();
  await expect(page.locator(".set-entry-labels")).toBeHidden();
  await expect(weight).toBeHidden();
  await page.getByRole("button", { name: "入力欄を開く", exact: true }).click();
  await expect(page.locator(".set-entry-labels")).toBeVisible();
  await weight.fill("80");
  await reps.fill("8");
  await page.getByRole("button", { name: "セットを追加", exact: true }).click();
  await expect.poll(() => state.saves).toBe(1);
  const savedSet = page.getByRole("button", { name: "セット1を編集", exact: true });
  const savedMeasurement = savedSet.locator(".current-set-selection");
  const savedMeasurementBefore = await savedMeasurement.boundingBox();
  const inputColor = await weight.evaluate((element) => getComputedStyle(element).color);
  const inputBackground = await weight.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await savedSet.click();
  await expect(page.locator(".set-entry")).toHaveClass(/editing-input/);
  await expect(savedSet.locator("xpath=..")).toHaveClass(/editing-set/);
  await expect(weight).toHaveCSS("color", inputColor);
  await expect(weight).toHaveCSS("background-color", inputBackground);
  expect(
    await savedMeasurement.evaluate(
      (element) => getComputedStyle(element, "::before").backgroundColor,
    ),
  ).toBe("rgb(255, 245, 245)");
  expect((await savedMeasurement.boundingBox())?.x).toBe(savedMeasurementBefore?.x);
  await expect(page.locator(".previous-set-cell").first()).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
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

test("ホイールは下に引くと増え、上に引くと減り、指を離しても値を戻さない", async ({ page }) => {
  const state = await mockTraining(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startTraining(page);
  for (const [label, initial, increased] of [
    ["重量", "80", "81"],
    ["回数", "8", "10"],
  ]) {
    const field = page.getByRole("spinbutton", { name: label, exact: true });
    await field.fill(initial);
    for (const [distance, expected] of [
      [36, increased],
      [-36, initial],
    ] as const) {
      const box = await field.boundingBox();
      if (!box) throw new Error("入力欄がありません");
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + distance, { steps: 4 });
      await expect(field).toHaveValue(expected);
      await page.mouse.up();
      await expect(field).toHaveValue(expected);
    }
  }
  expect(state.saves).toBe(0);
});
