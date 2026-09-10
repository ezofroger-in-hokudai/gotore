import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

for (const close of ["閉じる", "戻る"] as const) {
  test(`別グループの共有詳細を${close}と、選択と仲間の記録を保持する`, async ({ page }) => {
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
      exercises: [{ name: "スクワット", sets: [{ weight: 100, reps: 5 }] }],
    };
    const summary = {
      group_id: second.id,
      member_count: 2,
      live_count: 0,
      today_count: 1,
      members: [],
    };
    await page.route("**/api/groups", (route) => route.fulfill({ json: [state.group, second] }));
    await page.route("**/api/groups/activity/summary", (route) =>
      route.fulfill({ json: [{ ...summary, group_id: state.group.id }, summary] }),
    );
    await page.route("**/api/groups/second/activity", (route) =>
      route.fulfill({
        json: {
          ...summary,
          feed: [
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
          ],
        },
      }),
    );
    await page.route("**/api/groups/second/workouts/friend-record", (route) =>
      route.fulfill({ json: record }),
    );
    await page.reload();
    await navigate(page, "設定");
    await navigate(page, "ホーム");
    const length = await page.evaluate(() => history.length);
    const selected = page.getByRole("button", { name: "大学トレ部を表示", exact: true });
    await selected.click();
    const open = page.getByRole("button", { name: "友達Aの記録詳細を開く", exact: true });
    await expect(open).toBeVisible();
    expect(await page.evaluate(() => history.length)).toBe(length);
    await open.click();
    const dialog = page.getByRole("dialog", { name: "記録の詳細", exact: true });
    await expect(dialog.locator(".record-set")).toHaveCount(1);
    if (close === "閉じる")
      await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    else await page.goBack();
    await expect(dialog).toHaveCount(0);
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(open).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
    await page.goForward();
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(open).toBeVisible();
  });
}
