import { expect, test } from "@playwright/test";
import { mockTraining, openRecord, startTraining } from "./mock-training";

for (const ongoing of [false, true]) {
  test(ongoing
    ? "記録済みの進行中トレーニングをコピーで上書きしない"
    : "コピーを確認し、元の実績を変えず今日の全所属グループへ保存する", async ({ page }) => {
    const state = await mockTraining(page);
    const original = {
      id: "old",
      user_id: state.user.id,
      display_name: "画面テスト",
      group_id: null,
      performed_on: "2026-01-01",
      created_at: "2026-01-01T00:00:00Z",
      revision: 1,
      exercises: [{ name: "スクワット", sets: [{ weight: 80.5, reps: 8 }] }],
    };
    const snapshot = JSON.stringify(original);
    await page.route("**/api/workouts?**", (route) => route.fulfill({ json: [original] }));
    if (ongoing) {
      await startTraining(page);
      await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
      await expect(page.getByText("保存しました", { exact: true })).toBeVisible();
    }
    await openRecord(page);
    await page.getByRole("button", { name: "コピー", exact: true }).click();
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
    expect(state.saves).toBe(ongoing ? 1 : 0);
    await page.getByRole("button", { name: "コピー", exact: true }).click();
    await page.getByRole("button", { name: "コピーする", exact: true }).click();
    if (ongoing) {
      await expect(
        page.getByRole("button", { name: "コピーしたセットを保存", exact: true }),
      ).toBeDisabled();
      expect(state.session?.exercises[0].name).toBe("ベンチプレス");
    } else {
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "トレーニングを開始", exact: true })
        .click();
      await page.getByRole("button", { name: "コピーしたセットを保存", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(state.session?.exercises).toEqual(original.exercises);
      expect(state.session?.shared_group_ids).toEqual([state.group.id]);
      expect(state.session?.id).not.toBe(original.id);
    }
    expect(JSON.stringify(original)).toBe(snapshot);
  });
}
