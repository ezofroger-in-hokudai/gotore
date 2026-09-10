import { type Page, expect, test } from "@playwright/test";
import { mockTraining, navigate, openGroup, openRecord, startTraining } from "./mock-training";

test.use({ locale: "ja-JP" });

async function activityFixture(page: Page) {
  const state = await mockTraining(page);
  let failMonth = false;
  let failDay = false;
  let holdDay: Promise<void> | null = null;
  await page.route("**/api/workouts/activity?*", (route) => {
    if (failMonth) return route.abort();
    const month = new URL(route.request().url()).searchParams.get("month");
    const days =
      month === "2024-02"
        ? [
            { date: "2024-02-01", set_count: 5, workout_count: 2 },
            { date: "2024-02-29", set_count: 51, workout_count: 51 },
          ]
        : [];
    return route.fulfill({
      json: {
        month,
        metric: "sets",
        days,
        total_sets: days.length ? 56 : 0,
        workout_count: days.length ? 53 : 0,
        active_days: days.length,
      },
    });
  });
  await page.route("**/api/workouts?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const day = params.get("performed_on");
    if (day && failDay) return route.abort();
    if (day === "2024-02-01" && holdDay) await holdDay;
    const offset = Number(params.get("offset") ?? 0);
    const count = day === "2024-02-29" ? (offset ? 1 : 50) : day === "2024-02-01" ? 2 : 0;
    return route.fulfill({
      json: Array.from({ length: count }, (_, i) => ({
        id: `${day}-${offset + i}`,
        user_id: state.user.id,
        display_name: "画面テスト",
        group_id: null,
        performed_on: day,
        created_at: "2024-02-29T00:00:00Z",
        exercises: [
          {
            name: `${day}の種目${offset + i + 1}`,
            sets: Array.from({ length: day === "2024-02-01" ? (i === 0 ? 3 : 2) : 1 }, () => ({
              weight: 30,
              reps: 10,
            })),
          },
        ],
      })),
    });
  });
  await page.getByRole("navigation").getByRole("button", { name: "履歴", exact: true }).click();
  await page.getByLabel("月", { exact: true }).fill("2024-02");
  return {
    failMonth: (value: boolean) => {
      failMonth = value;
    },
    failDay: (value: boolean) => {
      failDay = value;
    },
    holdDay: (value: Promise<void> | null) => {
      holdDay = value;
    },
  };
}

test("セット数ヒートマップから日付を選び、日別記録を50件ずつ確認する", async ({ page }) => {
  await activityFixture(page);
  const day = page.getByRole("button", { name: "2024年2月29日、51セット、51件", exact: true });
  await expect(day).toHaveAttribute("data-level", "4");
  await expect(
    page.getByRole("button", { name: "2024年2月1日、5セット、2件", exact: true }),
  ).toHaveAttribute("data-level", "1");
  await day.focus();
  await page.keyboard.press("Enter");
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".history-row")).toHaveCount(50);
  await page.getByRole("button", { name: "以前の記録", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await expect(page.locator(".history-row")).toContainText("2024-02-29の種目51");
  await page.getByRole("button", { name: "2024年2月2日、0セット、0件", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(0);
  await expect(page.getByText("この日は記録なし", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "すべての記録", exact: true }).click();
  await expect(day).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "2024年2月1日、5セット、2件", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(2);

  await page.screenshot({ path: "test-results/activity-heatmap-mobile.png", fullPage: true });
});

test("月と日付の取得失敗を再試行し、遅い前日の応答を表示しない", async ({ page }) => {
  const state = await activityFixture(page);
  state.failMonth(true);
  await page.getByRole("button", { name: "前の月", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "通信できません" })).toBeVisible();
  await expect(page.getByRole("button", { name: /2024年2月29日/ })).toHaveCount(0);
  state.failMonth(false);
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByText("この月は記録なし", { exact: true })).toBeVisible();
  await page.getByLabel("月", { exact: true }).fill("2024-02");
  state.failDay(true);
  await page.getByRole("button", { name: /2024年2月29日/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "通信できません" })).toBeVisible();
  state.failDay(false);
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(50);
  let release = () => {};
  state.holdDay(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  try {
    await page.getByRole("button", { name: /2024年2月1日、/ }).click();
    await expect(page.locator(".history-row")).toHaveCount(0);
    await page.getByRole("button", { name: /2024年2月2日、/ }).click();
    release();
    await expect(page.getByText("この日は記録なし", { exact: true })).toBeVisible();
    await expect(page.locator(".history-row")).toHaveCount(0);
  } finally {
    release();
  }
});

test("日本時間の今日を示し、未来の日付と範囲外の月への移動を許可しない", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2024-02-10T15:00:00Z"));
  await activityFixture(page);
  await expect(page.getByRole("button", { name: "次の月", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "2024年2月11日、0セット、0件", exact: true }),
  ).toHaveAttribute("aria-current", "date");
  await expect(
    page.getByRole("button", { name: "2024年2月12日、未来の日付", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("月", { exact: true }).fill("2000-01");
  await expect(page.getByRole("button", { name: "前の月", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "次の月", exact: true })).toBeEnabled();
});

test("過去月の詳細から戻っても月・選択日・ページを保持し、月変更で絞り込みを解除する", async ({
  page,
}) => {
  await activityFixture(page);
  const day = page.getByRole("button", { name: "2024年2月29日、51セット、51件", exact: true });
  await day.click();
  await page.getByRole("button", { name: "以前の記録", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await page.locator(".history-row").click();
  await expect(page.locator(".history-detail")).toContainText("2024-02-29の種目51");
  await page.getByRole("button", { name: "‹ 履歴", exact: true }).click();
  await expect(page.getByLabel("月", { exact: true })).toHaveValue("2024-02");
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".history-row")).toContainText("2024-02-29の種目51");
  await expect(page.getByText("2ページ", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "前の月", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "最近のトレーニング", exact: true }),
  ).toBeVisible();
  await page.getByLabel("月", { exact: true }).fill("2024-02");
  await day.click();
  await expect(page.getByText("1ページ", { exact: true })).toBeVisible();
});
