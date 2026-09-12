import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

test("旧形式の未送信セットを保持して差分へ移行し、再起動後も順序どおり保存する", async ({
  page,
}) => {
  const state = await mockTraining(page);
  await startTraining(page);
  const weight = page.getByRole("spinbutton", { name: "重量", exact: true });
  await weight.fill("80");
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect.poll(() => state.session?.exercises[0]?.sets.length).toBe(1);
  const base = structuredClone(state.session);
  if (!base) throw new Error("開始していません");
  const first = structuredClone(base.exercises);
  first[0].sets.push({ weight: 82.5, reps: 8 });
  const second = structuredClone(first);
  second[0].sets.push({ weight: 85, reps: 8 });
  const legacy = JSON.stringify({
    base,
    pending: [
      { id: "old-1", exercises: first },
      { id: "old-2", exercises: second },
    ],
  });
  const key = `gotore:session-queue:v1:${state.user.id}`;
  state.failSave = true;
  await page.addInitScript(
    ({ key, legacy }) => {
      if (!sessionStorage.getItem("queue-test-seeded")) {
        localStorage.setItem(key, legacy);
        sessionStorage.setItem("queue-test-seeded", "1");
      }
    },
    { key, legacy },
  );
  await page.reload();
  await navigate(page, "記録");
  await expect(page.getByRole("button", { name: "セット3を編集", exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(legacy);
  await weight.fill("87.5");
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.version, key),
    )
    .toBe(2);
  await page.reload();
  await navigate(page, "記録");
  await expect(page.getByRole("button", { name: "セット4を編集", exact: true })).toBeVisible();
  state.failSave = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() => state.session?.exercises[0]?.sets.map((set) => set.weight))
    .toEqual([80, 82.5, 85, 87.5]);
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.pending.length, key),
    )
    .toBe(0);
  expect(state.saves).toBe(4);
});
