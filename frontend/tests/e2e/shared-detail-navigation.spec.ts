import { expect, test } from "@playwright/test";
import { emptyTodayActivity, mockTraining, navigate } from "./mock-training";

for (const close of ["縮小", "画面移動"] as const) {
  test(`別グループの共有記録を${close}しても選択とブラウザ履歴を保持する`, async ({ page }) => {
    const state = await mockTraining(page);
    const second = { ...state.group, id: "second", name: "大学トレ部" };
    const record = {
      id: "friend-record",
      user_id: "friend",
      display_name: "友達A",
      group_id: second.id,
      performed_on: "2026-09-11",
      created_at: "2026-09-11T00:00:00Z",
      revision: 1,
      exercises: [
        { name: "スクワット", sets: Array.from({ length: 20 }, () => ({ weight: 100, reps: 5 })) },
      ],
    };
    await page.route("**/api/groups", (route) => route.fulfill({ json: [state.group, second] }));
    await page.route("**/api/groups/today-activity", (route) => {
      const activity = emptyTodayActivity([state.group, second]);
      activity.groups[1].feed = [
        {
          workout_id: record.id,
          user_id: record.user_id,
          display_name: record.display_name,
          exercise: "スクワット",
          weight: 100,
          reps: 5,
          estimated_rm: 116.7,
          updated_at: record.created_at,
          best: false,
        },
      ];
      return route.fulfill({ json: activity });
    });
    await page.route("**/api/groups/second/workouts/friend-record", (route) =>
      route.fulfill({ json: record }),
    );
    await page.reload();
    await navigate(page, "設定");
    await navigate(page, "ホーム");
    const length = await page.evaluate(() => history.length);
    const selected = page.getByRole("button", { name: "大学トレ部を表示", exact: true });
    await selected.click();
    const card = page.locator('[data-workout-id="friend-record"]');
    const expand = card.getByRole("button", { name: "友達Aの全セットを表示", exact: true });
    await expect(expand).toBeVisible();
    await expand.click();
    await expect(card.locator(".record-set")).toHaveCount(20);
    expect(await page.evaluate(() => history.length)).toBe(length);
    if (close === "縮小")
      await card.getByRole("button", { name: "友達Aの記録を小さく表示", exact: true }).click();
    else {
      await navigate(page, "設定");
      await page.goBack();
    }
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(card).toContainText("スクワット");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
    await page.goForward();
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(card).toContainText("スクワット");
  });
}
