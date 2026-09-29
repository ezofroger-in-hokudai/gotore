import { expect, test } from "@playwright/test";
import { showRecordingMemos } from "./mock-training";
import { mockTraining, navigate, openTraining, startTraining } from "./mock-training";

for (const destination of ["ホーム", "設定"]) {
  test(`保存完了時に${destination}なら比較を取得せず、記録へ戻ると更新する`, async ({ page }) => {
    const state = await mockTraining(page);
    await startTraining(page);
    await showRecordingMemos(page);
    await expect(page.getByRole("button", { name: "種目メモを編集", exact: true })).toBeEnabled();
    const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
    await weight.fill("77.5");
    await page.getByRole("button", { name: "今日のメモを編集", exact: true }).click();
    await page.getByRole("textbox", { name: "今日のメモ", exact: true }).fill("入力途中のメモ");
    await page.getByRole("button", { name: "種目メモを編集", exact: true }).click();
    await page.getByRole("textbox", { name: "種目メモ", exact: true }).fill("種目の下書き");
    let contexts = 0;
    let allContexts = 0;
    let releaseContext = () => {};
    const contextGate = new Promise<void>((resolve) => {
      releaseContext = resolve;
    });
    await page.route("**/api/exercises/context?**", async (route) => {
      allContexts++;
      if (new URL(route.request().url()).searchParams.get("name") === "ベンチプレス") contexts++;
      await contextGate;
      return route.fulfill({
        json: {
          best_weight: 99,
          best_rm: 120,
          previous: null,
          memo: { content: "", revision: 0 },
        },
      });
    });
    let release = () => {};
    let started = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/sessions/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      started = true;
      await gate;
      return route.fallback();
    });
    try {
      await page.getByRole("button", { name: "セットを追加", exact: true }).click();
      await expect.poll(() => started).toBe(true);
      await navigate(page, destination);
      await page.waitForTimeout(250);
      const beforeSaveCompletion = allContexts;
      release();
      await expect.poll(() => state.saves).toBe(1);
      await expect(page.locator(".sync-status")).toHaveCount(0);
      await page.waitForTimeout(250);
      expect(allContexts).toBe(beforeSaveCompletion);
      const beforeReturn = contexts;
      await openTraining(page);
      await showRecordingMemos(page);
      await expect.poll(() => contexts).toBe(beforeReturn + 1);
      await expect(page.locator(".previous-set-cell").first()).toContainText("80kg");
      await expect(page.getByRole("region", { name: "種目メモ", exact: true })).toContainText(
        "種目の下書き",
      );
      releaseContext();
      await expect(page.locator(".previous-set-cell").first()).toContainText("—");
      expect(contexts).toBe(beforeReturn + 1);
      await expect(weight).toHaveValue("77.5");
      await expect(page.getByRole("region", { name: "今日のメモ", exact: true })).toContainText(
        "入力途中のメモ",
      );
      await page.getByRole("button", { name: "セットを追加", exact: true }).click();
      await expect.poll(() => contexts).toBe(beforeReturn + 2);
      expect(state.saves).toBe(2);
    } finally {
      releaseContext();
      release();
    }
  });
}

test("保存待ちの全セット一覧を離れた後はBEST取得を延期し、復帰時のrevisionで更新する", async ({
  page,
}) => {
  const state = await mockTraining(page);
  await startTraining(page);
  await showRecordingMemos(page);
  let bests = 0;
  const revisions: number[] = [];
  await page.route("**/api/sessions/*/bests", (route) => {
    bests++;
    revisions.push(state.session?.revision ?? 0);
    return route.fallback();
  });
  let release = () => {};
  let started = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/sessions/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    started = true;
    await gate;
    return route.fallback();
  });
  try {
    await page.getByRole("button", { name: "セットを追加", exact: true }).click();
    await expect.poll(() => started).toBe(true);
    await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
    await expect.poll(() => bests).toBe(1);
    await navigate(page, "ホーム");
    release();
    await expect(page.locator(".sync-status")).toHaveCount(0);
    await page.waitForTimeout(250);
    expect(bests).toBe(1);
    await openTraining(page);
    await showRecordingMemos(page);
    await expect.poll(() => bests).toBe(2);
    expect(revisions).toEqual([1, 2]);
    expect(state.saves).toBe(1);
  } finally {
    release();
  }
});
