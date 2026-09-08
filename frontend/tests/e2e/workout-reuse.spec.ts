import { expect, test } from "@playwright/test";
import { mockTraining } from "./mock-training";

for (const storageFails of [false, true]) {
  test(storageFails
    ? "下書きを保存できない場合も再利用入力と警告を表示する"
    : "下書きの置き換えを確認し、元の実績と別の記録を作る", async ({ page }) => {
    const { user, group } = await mockTraining(page);
    const record = {
      id: "00000000-0000-0000-0000-000000000010",
      user_id: user.id,
      display_name: "画面テスト",
      group_id: group.id,
      performed_on: "2026-01-01",
      created_at: "2026-01-01T00:00:00Z",
      exercises: [{ name: "スクワット", sets: [{ weight: 80.5, reps: 8 }] }],
    };
    const snapshot = JSON.stringify(record);
    let saved: typeof record | null = null;
    let submissions = 0;
    await page.route("**/api/workouts**", (route) => {
      if (new URL(route.request().url()).pathname === "/api/workouts/activity")
        return route.fallback();
      if (route.request().method() === "POST") {
        submissions++;
        const body = route.request().postDataJSON();
        expect(body.id).not.toBe(record.id);
        expect(body.group_id).toBeNull();
        expect(body.performed_on).toBe(
          new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()),
        );
        saved = { ...record, ...body };
        return route.fulfill({ status: 201, json: saved });
      }
      return route.fulfill({ json: saved ? [saved, record] : [record] });
    });
    await page.getByRole("button", { name: "＋ 記録する", exact: true }).click();
    await page.getByLabel("種目名", { exact: true }).selectOption({ label: "ベンチプレス" });
    await page.getByRole("button", { name: "← 戻る", exact: true }).click();
    const key = `gotore:draft:${user.id}`;
    const draft = await page.evaluate((key) => localStorage.getItem(key), key);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "自分の記録", exact: true })
      .click();
    await page.getByRole("button", { name: "コピー", exact: true }).click();
    await expect(
      page.getByText("下書きをこの記録で置き換えますか？", { exact: false }),
    ).toBeVisible();
    if (!storageFails) await page.screenshot({ path: "test-results/workout-reuse-mobile.png" });
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(draft);
    if (storageFails)
      await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith("gotore:draft:")) throw new Error("test storage blocked");
          return original.call(this, key, value);
        };
      });
    await page.getByRole("button", { name: "コピー", exact: true }).click();
    await page.getByRole("button", { name: "コピーする", exact: true }).click();
    await expect(page.getByLabel("種目1 セット1 重量", { exact: true })).toHaveValue("80.5");
    await expect(page.getByRole("combobox", { name: "共有先", exact: true })).toHaveValue("");
    expect(submissions).toBe(0);
    await page.getByLabel("種目1 セット1 重量", { exact: true }).fill("82.5");
    if (storageFails) {
      await expect(
        page.getByRole("status").filter({ hasText: "下書きを保持できません" }),
      ).toBeVisible();
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(draft);
    } else {
      await page.reload();
      await page.getByRole("button", { name: "＋ 記録する", exact: true }).click();
      await expect(page.getByLabel("種目1 セット1 重量", { exact: true })).toHaveValue("82.5");
    }
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(2);
    expect(JSON.stringify(record)).toBe(snapshot);
    expect(submissions).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
