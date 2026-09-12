import { type Page, expect, test } from "@playwright/test";
import { mockTraining, startTraining } from "./mock-training";

test("端末保存を待つ間に入力した次セットの値を保持する", async ({ page }) => {
  const state = await mockTraining(page);
  await startTraining(page);
  const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
  await weight.fill("60");
  const lockName = `gotore:session-queue:v1:${state.user.id}:store`;
  await holdStore(page, lockName);
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async (name) => (await navigator.locks.query()).pending?.some((lock) => lock.name === name),
        lockName,
      ),
    )
    .toBe(true);
  await weight.fill("82.5");
  await page.evaluate(() => window.dispatchEvent(new Event("release-test-store")));
  await expect.poll(() => state.session?.exercises[0]?.sets).toEqual([{ weight: 60, reps: 10 }]);
  await expect(weight).toHaveValue("82.5");
  const inputKey = `gotore:session-input:v2:${state.user.id}:${state.session?.id}`;
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), inputKey))
    .toMatchObject({ weight: "82.5", dirty: true, revision: state.session?.revision });
  await page.reload();
  await page.getByRole("button", { name: "記録", exact: true }).click();
  await expect(weight).toHaveValue("82.5");
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect
    .poll(() => state.session?.exercises[0]?.sets)
    .toEqual([
      { weight: 60, reps: 10 },
      { weight: 82.5, reps: 10 },
    ]);
});

async function holdStore(page: Page, lockName: string) {
  await page.evaluate(
    (name) =>
      new Promise<void>((acquired) => {
        void navigator.locks.request(
          name,
          () =>
            new Promise<void>((release) => {
              window.addEventListener("release-test-store", () => release(), { once: true });
              acquired();
            }),
        );
      }),
    lockName,
  );
}

for (const change of ["編集中の回数", "選択種目"]) {
  test(`端末保存待機中の${change}も保持する`, async ({ page }) => {
    const state = await mockTraining(page);
    await startTraining(page);
    await page.getByRole("spinbutton", { name: "重量", exact: true }).fill("60");
    await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
    await expect.poll(() => state.session?.exercises[0]?.sets.length).toBe(1);
    await page.getByRole("button", { name: "セット1を編集", exact: true }).click();
    await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("8");
    await holdStore(page, `gotore:session-queue:v1:${state.user.id}:store`);
    await page.getByRole("button", { name: "変更を保存", exact: true }).click();
    if (change === "編集中の回数") {
      await page.getByRole("spinbutton", { name: "回数", exact: true }).fill("9");
    } else {
      await page.getByRole("button", { name: "種目を変更", exact: true }).click();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: /^スクワット/ }).click();
    }
    await page.evaluate(() => window.dispatchEvent(new Event("release-test-store")));
    await expect.poll(() => state.session?.exercises[0]?.sets).toEqual([{ weight: 60, reps: 8 }]);
    if (change === "編集中の回数") {
      await expect(page.getByRole("spinbutton", { name: "回数", exact: true })).toHaveValue("9");
      await page.getByRole("button", { name: "変更を保存", exact: true }).click();
      await expect.poll(() => state.session?.exercises[0]?.sets).toEqual([{ weight: 60, reps: 9 }]);
    } else {
      await expect(page.getByRole("heading", { name: "スクワット", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
      await expect.poll(() => state.session?.exercises[1]?.name).toBe("スクワット");
    }
  });
}
