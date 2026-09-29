import { expect, test } from "@playwright/test";
import { mockTraining, navigate, startTraining } from "./mock-training";

function today(groups: { id: string; name: string }[], live: boolean) {
  return {
    totals: { set_count: 0, total_volume: 0 },
    groups: groups.map((group) => ({
      group_id: group.id,
      name: group.name,
      member_count: 1,
      live_count: live ? 1 : 0,
      today_count: 0,
      members: [],
      feed: [],
      totals: { set_count: 0, total_volume: 0 },
    })),
  };
}

for (const live of [false, true]) {
  test(`ホーム1分の要求数を計測する（LIVE ${live ? "あり" : "なし"}）`, async ({ page }) => {
    await page.clock.install();
    const state = await mockTraining(page);
    const groups = [state.group, { ...state.group, id: "another-group", name: "別グループ" }];
    const counts = { groups: 0, today: 0 };
    await page.route("**/api/groups", (route) => {
      counts.groups++;
      return route.fulfill({ json: groups });
    });
    await page.route("**/api/groups/today-activity", (route) => {
      counts.today++;
      return route.fulfill({ json: today(groups, live) });
    });
    await page.reload();
    await expect(page.locator(".group-carousel .community-card")).toHaveCount(2);
    await expect.poll(() => counts.today).toBeGreaterThan(0);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    const initial = { ...counts };
    for (let tick = 0; tick < 12; tick++) {
      await page.clock.runFor(5000);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const measured = {
      groups: counts.groups - initial.groups,
      today: counts.today - initial.today,
    };
    await test.info().attach("requests-per-minute", {
      body: JSON.stringify({ live, measured }),
      contentType: "application/json",
    });
    expect(measured).toEqual({ groups: 1, today: live ? 12 : 4 });
  });
}

test("ホームの通常更新を15秒に分け、所属一覧を毎回読み直さない", async ({ page }) => {
  await mockTraining(page);
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const counts = { groups: 0, today: 0 };
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/groups") counts.groups++;
    if (path === "/api/groups/today-activity") counts.today++;
  });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => counts.today).toBeGreaterThan(0);
  await expect(page.locator(".group-carousel .community-card").first()).toContainText(
    "画面テスト部",
  );
  const initial = { ...counts };
  await page.clock.runFor(5_000);
  expect(counts).toEqual(initial);
  await page.clock.runFor(10_000);
  await expect.poll(() => counts.today).toBe(initial.today + 1);
  expect(counts.groups).toBe(initial.groups);
});

test("仲間のLIVEを見つけた後は5秒、終了を確認した後は15秒へ戻す", async ({ page }) => {
  await page.clock.install();
  const state = await mockTraining(page);
  let live = false;
  let reads = 0;
  await page.route("**/api/groups/today-activity", (route) => {
    reads++;
    return route.fulfill({ json: today([state.group], live) });
  });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => reads).toBeGreaterThan(0);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const initial = reads;
  live = true;
  await page.clock.runFor(15_000);
  await expect.poll(() => reads).toBe(initial + 1);
  await page.clock.runFor(5_000);
  await expect.poll(() => reads).toBe(initial + 2);
  live = false;
  await page.clock.runFor(5_000);
  await expect.poll(() => reads).toBe(initial + 3);
  await page.clock.runFor(5_000);
  expect(reads).toBe(initial + 3);
  await page.clock.runFor(10_000);
  await expect.poll(() => reads).toBe(initial + 4);
});

test("LIVEは5秒で更新し、画面非表示と記録入力中はホーム通信を止める", async ({ page }) => {
  await page.clock.install();
  await mockTraining(page);
  await startTraining(page);
  await navigate(page, "ホーム");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("region", { name: "今日の活動" })).toContainText("1人");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  let requests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/groups/today-activity") requests++;
  });
  await page.clock.runFor(5_000);
  await expect.poll(() => requests).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(60_000);
  expect(requests).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => requests).toBe(2);
  await page.getByRole("button", { name: "トレーニングを再開", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "重量", exact: true })).toBeVisible();
  const stopped = requests;
  await page.clock.runFor(60_000);
  expect(requests).toBe(stopped);
});
