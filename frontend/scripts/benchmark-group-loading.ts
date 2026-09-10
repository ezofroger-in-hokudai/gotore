import { chromium, expect } from "@playwright/test";
import { mockTraining } from "../tests/e2e/mock-training";
const browser = await chromium.launch({ headless: true });
const results = [];
for (const count of [1, 5, 10]) {
  const page = await browser.newPage({
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 390, height: 844 },
  });
  const state = await mockTraining(page);
  const groups = Array.from({ length: count }, (_, i) => ({
    ...state.group,
    id: i ? `group-${i}` : state.group.id,
    name: `グループ${i + 1}`,
  }));
  const activity = (id: string) => ({
    group_id: id,
    observed_at: "2026-09-11T00:00:00Z",
    member_count: 10,
    live_count: 0,
    today_count: 10,
    members: Array.from({ length: 10 }, (_, i) => ({
      id: `member-${i}`,
      display_name: `メンバー${i}`,
      live: false,
      today: true,
    })),
    feed: Array.from({ length: 10 }, (_, i) => ({
      workout_id: `record-${id}-${i}`,
      user_id: `member-${i}`,
      display_name: `メンバー${i}`,
      exercise: "ベンチプレス",
      weight: 80,
      reps: 8,
      estimated_rm: 101.3,
      updated_at: "2026-09-11T00:00:00Z",
      best: false,
    })),
  });
  const counts = { groups: 0, activity: 0, summary: 0 };
  let bytes = 0;
  let pending = 0;
  await page.route("**/api/groups**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    let kind: keyof typeof counts;
    if (path === "/api/groups") {
      body = groups;
      kind = "groups";
    } else if (path === "/api/groups/activity/summary") {
      body = groups.map((g) => {
        const { feed, ...summary } = activity(g.id);
        return summary;
      });
      kind = "summary";
    } else if (path.endsWith("/activity")) {
      body = activity(path.split("/")[3]);
      kind = "activity";
    } else return route.fallback();
    counts[kind]++;
    const json = JSON.stringify(body);
    bytes += Buffer.byteLength(json);
    pending++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    await route.fulfill({ contentType: "application/json", body: json });
    pending--;
  });
  const started = performance.now();
  await page.reload();
  await expect(page.locator(".group-carousel .community-card")).toHaveCount(count);
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(page.locator(".community-total").filter({ hasText: "メンバー 10人" })).toHaveCount(
    count,
  );
  const displayMs = performance.now() - started;
  await expect.poll(() => pending).toBe(0);
  await page.waitForTimeout(200);
  const initial = { ...counts, bytes, displayMs: Math.round(displayMs) };
  await page.waitForTimeout(10_500);
  results.push({
    groups: count,
    initial,
    window: {
      groups: counts.groups - initial.groups,
      activity: counts.activity - initial.activity,
      summary: counts.summary - initial.summary,
      bytes: bytes - initial.bytes,
    },
  });
  await page.close();
}
console.log(JSON.stringify(results, null, 2));
await browser.close();
