import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("A案の全セット表をすぐ表示し、幅・文字拡大・大量セットでも詳細を読み取れる", async ({
  page,
}) => {
  const state = await mockTraining(page);
  const name = "長い種目名のダンベルベンチプレス（胸を意識したフォーム）";
  state.finished = [
    {
      id: "review",
      user_id: state.user.id,
      display_name: "画面テスト",
      group_id: state.group.id,
      performed_on: "2026-09-13",
      created_at: "2026-09-13T01:00:00Z",
      revision: 1,
      started_at: "2026-09-13T01:00:00Z",
      ended_at: "2026-09-13T01:48:00Z",
      exercises: [
        {
          name,
          sets: [
            { weight: 95, reps: 1 },
            { weight: 80, reps: 10 },
            { weight: 75, reps: 10 },
          ],
        },
        { name: "自重", sets: [{ weight: 0, reps: 12 }] },
        {
          name: "上限表示",
          sets: Array.from({ length: 30 }, () => ({ weight: 999.9, reps: 1000 })),
        },
      ],
      best_sets: [
        { exercise_index: 0, set_index: 0, weight: true, rm: false },
        { exercise_index: 0, set_index: 1, weight: false, rm: true },
      ],
    },
  ];
  await page.route("**/api/workouts/activity?*", (route) =>
    route.fulfill({
      json: {
        month: new URL(route.request().url()).searchParams.get("month"),
        metric: "volume",
        total_volume: 3000,
        total_sets: 34,
        workout_count: 1,
        active_days: 1,
        days: [{ date: "2026-09-13", volume: 3000, set_count: 34, workout_count: 1 }],
      },
    }),
  );
  await navigate(page, "履歴");
  await page.locator('.personal-history-calendar button[aria-label*="9月13日"]').click();
  const detail = page.getByRole("dialog", { name: /9月13日の全メニュー/ });
  await expect(detail.getByRole("table")).toHaveCount(3);
  await expect(detail.locator(".record-set")).toHaveCount(34);
  await expect(detail.locator("details")).toHaveCount(0);
  await expect(detail.locator("time")).toHaveCount(1);
  await expect(detail.locator(".record-author")).toHaveCount(0);
  await expect(
    detail.getByRole("table", { name: "自重", exact: true }).getByRole("cell"),
  ).toHaveText(["0", "12", "—"]);
  await expect(detail.getByRole("img", { name: "自己最高RM", exact: true })).toBeVisible();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const table of await detail.locator(".record-table-scroll").all()) {
      expect(await table.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/record-review-self-390.png", fullPage: true });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const scroll = detail.locator(".record-table-scroll").first();
  await scroll.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await detail.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(
    page.locator('.personal-history-calendar button[aria-label*="9月13日"]'),
  ).toBeVisible();
});
