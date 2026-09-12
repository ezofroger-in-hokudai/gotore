import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

test("保存の応答待ちでも連続追加・編集でき、順序通り同期する", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  await page.route("**/api/sessions/*", async (route) => {
    if (route.request().method() === "PATCH" && first) {
      first = false;
      await gate;
    }
    await route.fallback();
  });
  try {
    await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("70");
    await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await expect(page.getByRole("heading", { name: "SET 2", exact: true })).toBeVisible();
    expect(state.saves).toBe(0);
    await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("75");
    await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await expect(page.getByRole("heading", { name: "SET 3", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "セット2を編集", exact: true })).toContainText(
      "75kg",
    );
    await page.getByRole("button", { name: "セット2を編集", exact: true }).click();
    await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("77.5");
    await page.getByRole("button", { name: "変更を保存", exact: true }).click();
    expect(state.saves).toBe(0);
    release();
    await expect
      .poll(() => state.session?.exercises[0]?.sets)
      .toEqual([
        { weight: 70, reps: 8 },
        { weight: 77.5, reps: 8 },
      ]);
    await expect(page.locator(".sync-status")).toContainText("同期済み");
  } finally {
    release();
  }
});

test("未送信の複数セットは再起動後も残り、再送できる", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  state.failSave = true;
  for (const weight of [70, 75]) {
    await page.getByRole("spinbutton", { name: "重量", exact: true }).fill(String(weight));
    await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  }
  await expect(page.locator(".sync-status")).toContainText("未送信");
  await page.reload();
  await navigate(page, "記録");
  await expect(page.getByRole("heading", { name: "SET 3", exact: true })).toBeVisible();
  expect(state.saves).toBe(0);
  state.failSave = false;
  await page.getByRole("button", { name: "再送", exact: true }).click();
  await expect.poll(() => state.saves).toBe(2);
});

test("メモと保存がスクロールなしで見え、指を離す前に重量が連続更新する", async ({ page }) => {
  await mockTraining(page);
  await startTraining(page);
  await expect(page.getByRole("button", { name: "種目メモを編集", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "前回のメモを編集", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "今回のメモを編集", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SET 2", exact: true })).toBeVisible();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 720 });
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        viewport: innerHeight,
      })),
    ).toEqual({ width, height: 720, viewport: 720 });
    await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toBeInViewport();
    await page.screenshot({ path: `test-results/session-compact-${width}.png`, fullPage: true });
  }
  const field = page.getByRole("spinbutton", { name: "重量", exact: true });
  const before = Number(await field.inputValue());
  const box = await field.boundingBox();
  if (!box) throw new Error("重量入力がありません");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 75, { steps: 8 });
  await expect.poll(async () => Number(await field.inputValue())).toBeLessThan(before);
  await page.mouse.up();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/session-compact.png", fullPage: true });
});

test("常時表示の種目メモは再起動しても下書きと競合元revisionを保つ", async ({ page }) => {
  await mockTraining(page);
  let memo = { content: "肩甲骨を寄せる", revision: 1 };
  await page.route("**/api/exercises/context?*", (route) =>
    route.fulfill({ json: { best_weight: 80, best_rm: 101.3, previous: null, memo } }),
  );
  await page.route("**/api/exercises/memo", (route) => {
    const body = route.request().postDataJSON();
    if (body.expected_revision !== memo.revision)
      return route.fulfill({ status: 409, json: { detail: "メモは変更済みです" } });
    memo = { content: body.content, revision: memo.revision + 1 };
    return route.fulfill({ json: memo });
  });
  await startTraining(page);
  await page.getByRole("button", { name: "種目メモを編集", exact: true }).click();
  const field = page.getByRole("textbox", { name: "種目メモ", exact: true });
  await expect(field).toHaveValue("肩甲骨を寄せる");
  await field.fill("足の位置を確認する");
  memo = { content: "別端末で修正", revision: 2 };
  await page.reload();
  await navigate(page, "記録");
  await expect(field).toHaveValue("足の位置を確認する");
  await page.getByRole("button", { name: "種目メモを保存", exact: true }).click();
  await expect(page.locator(".inline-memo").getByRole("alert")).toContainText("変更済み");
  expect(memo.content).toBe("別端末で修正");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".inline-memo").getByRole("button", { name: "読み直す", exact: true }).click();
  await expect(field).toHaveValue("別端末で修正");
  await field.fill("合意後の内容");
  await page.getByRole("button", { name: "種目メモを保存", exact: true }).click();
  await expect.poll(() => memo.content).toBe("合意後の内容");
});

test("文字拡大時は縦に読めるまま、入力と終了を隠さない", async ({ page }) => {
  await mockTraining(page);
  await startTraining(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".session-screen h1, .session-screen h2, .session-screen span, .session-screen button, .session-screen label, .session-screen input, .session-screen textarea, .session-screen small, .session-screen strong",
      ),
    );
    const sizes = nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    nodes.forEach((node, index) => {
      node.style.fontSize = `${sizes[index] * 2}px`;
    });
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole("button", { name: "次のセットへ", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toBeInViewport();
  await page
    .getByRole("button", { name: "トレーニング終了", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "トレーニング終了", exact: true }),
  ).toBeInViewport();
});

test("メモは本文だけを表示してタッチで編集し、空の前回メモを出さない", async ({ page }) => {
  await mockTraining(page);
  let memo = { content: "胸を張って押す", revision: 1 };
  let previousMemo = { content: "前回は余裕があった", revision: 1 };
  await page.route("**/api/exercises/context?*", (route) =>
    route.fulfill({
      json: {
        best_weight: 80,
        best_rm: 101.3,
        previous: { id: "previous", performed_on: "2026-01-01", sets: [{ weight: 80, reps: 8 }] },
        memo,
      },
    }),
  );
  await page.route("**/api/workouts/previous/memo", (route) =>
    route.fulfill({ json: previousMemo }),
  );
  await page.route("**/api/exercises/memo", (route) => {
    const body = route.request().postDataJSON();
    memo = { content: body.content, revision: memo.revision + 1 };
    return route.fulfill({ json: memo });
  });
  await startTraining(page);
  const exercise = page.getByRole("button", { name: "種目メモを編集", exact: true });
  const previous = page.getByRole("button", { name: "前回のメモを編集", exact: true });
  await expect(exercise).toHaveText("胸を張って押す");
  await expect(previous).toHaveText("前回は余裕があった");
  const previousBox = await previous.boundingBox();
  const exerciseBox = await exercise.boundingBox();
  if (!previousBox || !exerciseBox) throw new Error("メモが表示されていません");
  expect(previousBox.y).toBeGreaterThan(exerciseBox.y);
  await expect(page.getByRole("textbox", { name: "種目メモ", exact: true })).toHaveCount(0);
  for (const text of [
    "種目メモ",
    "前回のメモ",
    "今回のメモ",
    "自分だけのメモ",
    "推定1RM",
    "このセットを保存",
    "トレーニングを終了",
  ])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "次のセットへ", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "トレーニング終了", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/session-quiet-memos.png", fullPage: true });
  await exercise.click();
  await page.getByRole("textbox", { name: "種目メモ", exact: true }).fill("呼吸を整える");
  await page.getByRole("button", { name: "種目メモを保存", exact: true }).click();
  await expect(exercise).toHaveText("呼吸を整える");
  previousMemo = { content: "   ", revision: 2 };
  await page.reload();
  await navigate(page, "記録");
  await expect(exercise).toBeVisible();
  await expect(previous).toHaveCount(0);
});
