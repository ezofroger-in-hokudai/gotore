import { expect, test } from "@playwright/test";
import { mockTraining } from "./mock-training";

test("ホームで取得した仲間とグループを開始直後も表示する", async ({ page }) => {
  const state = await mockTraining(page);
  let requests = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/groups/today-activity", async (route) => {
    requests++;
    if (requests > 1) {
      await gate;
      return route.fulfill({ status: 403, json: { detail: "共有は解除されました" } });
    }
    return route.fulfill({
      json: {
        totals: { set_count: 1, total_volume: 400 },
        groups: [
          {
            group_id: state.group.id,
            name: state.group.name,
            member_count: 1,
            live_count: 0,
            today_count: 1,
            observed_at: new Date().toISOString(),
            totals: { set_count: 1, total_volume: 400 },
            members: [{ id: "peer", display_name: "仲間テスト", live: false, today: true }],
            feed: [
              {
                workout_id: "peer-workout",
                user_id: "peer",
                display_name: "仲間テスト",
                exercise: "ベンチプレス",
                weight: 80,
                reps: 5,
                updated_at: new Date().toISOString(),
                best: false,
              },
            ],
          },
        ],
      },
    });
  });
  try {
    await page.reload();
    await expect(page.getByText("仲間テスト").first()).toBeVisible();
    await page.getByRole("button", { name: "トレーニングを開始", exact: true }).click();
    const peers = page.getByRole("region", { name: "今日の仲間" });
    await expect(peers.getByRole("tab", { name: state.group.name })).toBeVisible();
    await expect(peers.getByRole("button", { name: "仲間テストの今日の記録を開く" })).toBeVisible();
    await expect.poll(() => requests).toBe(2);
    release();
    await expect(peers.getByRole("button", { name: "仲間テストの今日の記録を開く" })).toHaveCount(
      0,
    );
  } finally {
    release();
  }
});
