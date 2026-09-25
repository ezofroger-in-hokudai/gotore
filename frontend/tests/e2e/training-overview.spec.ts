import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("ホームから振り返りを外し、先読みした記録は履歴で確認できる", async ({ page }) => {
  const state = await mockTraining(page);
  await navigate(page, "設定");
  let reads = 0;
  const records = [11, 9, 7, 5].map((day, i) => ({
    id: `past-${day}`,
    user_id: state.user.id,
    display_name: "画面テスト",
    group_id: null,
    performed_on: `2026-09-${String(day).padStart(2, "0")}`,
    created_at: "2026-09-11T12:00:00Z",
    exercises: [
      {
        name: "ベンチプレス",
        sets: [
          { weight: 60 - i * 5, reps: 10 },
          { weight: 60 - i * 5, reps: 8 },
        ],
      },
      { name: "スクワット", sets: [{ weight: 80 - i * 5, reps: 8 }] },
    ],
  }));
  await page.route("**/api/workouts?*", async (route) => {
    reads++;
    return route.fulfill({ json: records });
  });
  await navigate(page, "ホーム");
  await expect.poll(() => reads).toBe(1);
  await expect(page.getByText("前回を振り返る", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "これまでのトレーニング" })).toHaveCount(0);
  await navigate(page, "履歴");
  await expect(page.locator(".history-row")).toHaveCount(3);
  await page.getByRole("button", { name: "もっと見る", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(4);
  await expect.poll(() => reads).toBe(2);
});
