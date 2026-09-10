import { chromium, expect } from "@playwright/test";
import { mockTraining, navigate } from "../tests/e2e/mock-training";

const browser = await chromium.launch({ headless: true });
type Counts = { detail: number; history: number; calendar: number };
const results: { detailMs: number; historyMs: number; beforeOpen: Counts; afterOpen: Counts }[] =
  [];
const baseURL = process.env.BENCHMARK_BASE_URL || "http://127.0.0.1:3100";
try {
  for (let sample = 0; sample < 6; sample++) {
    const page = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 } });
    const state = await mockTraining(page);
    const stamp = new Date().toISOString();
    const record = {
      id: "benchmark-record",
      user_id: "friend",
      display_name: "比較用の友達",
      group_id: state.group.id,
      performed_on: stamp.slice(0, 10),
      created_at: stamp,
      revision: 1,
      exercises: [
        {
          name: "ベンチプレス",
          sets: [
            { weight: 80, reps: 8 },
            { weight: 75, reps: 10 },
          ],
        },
      ],
    };
    const counts = { detail: 0, history: 0, calendar: 0 };
    const delayed = async () => new Promise((resolve) => setTimeout(resolve, 600));
    await page.route(`**/api/groups/${state.group.id}/activity`, (route) =>
      route.fulfill({
        json: {
          group_id: state.group.id,
          member_count: 2,
          live_count: 0,
          today_count: 1,
          members: [],
          feed: [
            {
              workout_id: record.id,
              user_id: record.user_id,
              display_name: record.display_name,
              exercise: "ベンチプレス",
              weight: 75,
              reps: 10,
              estimated_rm: 100,
              updated_at: stamp,
              best: false,
            },
          ],
        },
      }),
    );
    await page.route(`**/api/groups/${state.group.id}/workouts/${record.id}`, async (route) => {
      counts.detail++;
      await delayed();
      await route.fulfill({ json: record });
    });
    await page.route("**/api/workouts?*", async (route) => {
      counts.history++;
      await delayed();
      await route.fulfill({ json: [{ ...record, user_id: state.user.id }] });
    });
    await page.route("**/api/workouts/activity?*", async (route) => {
      counts.calendar++;
      await delayed();
      await route.fulfill({
        json: {
          month: stamp.slice(0, 7),
          metric: "sets",
          total_sets: 2,
          workout_count: 1,
          active_days: 1,
          days: [{ date: stamp.slice(0, 10), set_count: 2, workout_count: 1 }],
        },
      });
    });
    await page.reload();
    const open = page.getByRole("button", { name: "比較用の友達の記録詳細を開く", exact: true });
    await expect(open).toBeVisible();
    await page.waitForTimeout(2200);
    const beforeOpen = { ...counts };
    let started = performance.now();
    await open.click();
    const dialog = page.getByRole("dialog", { name: "記録の詳細", exact: true });
    await expect(dialog.locator(".record-set")).toHaveCount(2);
    const detailMs = Math.round(performance.now() - started);
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    started = performance.now();
    await navigate(page, "履歴");
    await expect(page.locator(".history-row")).toContainText("ベンチプレス");
    await expect(page.locator(".activity-totals")).toContainText("2セット");
    const historyMs = Math.round(performance.now() - started);
    if (sample) results.push({ detailMs, historyMs, beforeOpen, afterOpen: { ...counts } });
    await page.close();
  }
  const median = (key: "detailMs" | "historyMs") =>
    results.map((row) => row[key]).sort((a, b) => a - b)[2];
  process.stdout.write(
    `${JSON.stringify(
      {
        baseURL,
        delayMs: 600,
        samples: results,
        median: {
          detailMs: median("detailMs"),
          historyMs: median("historyMs"),
        },
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await browser.close();
}
