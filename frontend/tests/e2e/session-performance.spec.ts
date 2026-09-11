import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

for (const destination of ["ホーム", "設定"]) {
  test(`保存完了時に${destination}なら比較を取得せず、記録へ戻ると更新する`, async ({ page }) => {
    const state = await mockTraining(page);
    await startTraining(page);
    await expect(page.getByRole("button", { name: "種目メモを編集", exact: true })).toBeEnabled();
    const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
    await weight.fill("77.5");
    await page.getByRole("button", { name: "今回のメモを編集", exact: true }).click();
    await page.getByRole("textbox", { name: "今回のメモ", exact: true }).fill("入力途中のメモ");
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
      await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
      await expect.poll(() => started).toBe(true);
      await navigate(page, destination);
      release();
      await expect.poll(() => state.saves).toBe(1);
      await expect(page.locator(".sync-status")).toContainText("同期済み");
      await page.waitForTimeout(250);
      expect(allContexts).toBe(0);
      await navigate(page, "記録");
      await expect.poll(() => contexts).toBe(1);
      await expect(page.locator(".personal-bests")).toContainText("80");
      await expect(page.getByRole("textbox", { name: "種目メモ", exact: true })).toHaveValue(
        "種目の下書き",
      );
      releaseContext();
      await expect(page.locator(".personal-bests")).toContainText("99");
      expect(contexts).toBe(1);
      await expect(weight).toHaveValue("77.5");
      await expect(page.getByRole("textbox", { name: "今回のメモ", exact: true })).toHaveValue(
        "入力途中のメモ",
      );
      await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
      await expect.poll(() => contexts).toBe(2);
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
    await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await expect.poll(() => started).toBe(true);
    await page.getByRole("button", { name: "次の種目へ", exact: true }).click();
    await expect.poll(() => bests).toBe(1);
    await navigate(page, "ホーム");
    release();
    await expect(page.locator(".sync-status")).toContainText("同期済み");
    await page.waitForTimeout(250);
    expect(bests).toBe(1);
    await navigate(page, "記録");
    await expect.poll(() => bests).toBe(2);
    expect(revisions).toEqual([1, 2]);
    expect(state.saves).toBe(1);
  } finally {
    release();
  }
});
