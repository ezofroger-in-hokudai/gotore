import { expect, test } from "@playwright/test";
import { emptyTodayActivity, mockTraining, navigate } from "./mock-training";

test("初回のグループと種目を準備してからホームを表示する", async ({ page }) => {
  await mockTraining(page, true, false, false);
  let releaseFeed = () => {};
  let releaseOptions = () => {};
  const feed = new Promise<void>((resolve) => {
    releaseFeed = resolve;
  });
  const options = new Promise<void>((resolve) => {
    releaseOptions = resolve;
  });
  let requested = 0;
  await page.route("**/api/groups/today-activity", async (route) => {
    requested++;
    await feed;
    await route.fallback();
  });
  await page.route("**/api/exercise-options", async (route) => {
    requested++;
    await options;
    await route.fallback();
  });
  try {
    await page.reload();
    await expect.poll(() => requested).toBe(2);
    const startup = page.getByRole("status", { name: "アプリを読み込み中" });
    await expect(startup.locator("svg")).toBeVisible();
    await expect(page.getByRole("navigation")).toBeHidden();
    await page.screenshot({ path: "test-results/startup-preparing-390.png", fullPage: true });
    releaseFeed();
    await expect(startup).toBeVisible();
    releaseOptions();
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(startup).toHaveCount(0);
    await expect(page.locator(".group-carousel .community-card")).toContainText("0人");
    await expect(
      page.getByRole("button", { name: "トレーニングを開始", exact: true }),
    ).toBeEnabled();
    await page.screenshot({ path: "test-results/startup-ready-390.png", fullPage: true });
    await navigate(page, "設定");
    await navigate(page, "ホーム");
    await expect(startup).toHaveCount(0);
  } finally {
    releaseFeed();
    releaseOptions();
  }
});

test("初回取得が失敗してもホームの再試行へ進める", async ({ page }) => {
  await mockTraining(page);
  await page.route("**/api/groups", (route) =>
    route.fulfill({ status: 503, json: { detail: "グループ取得失敗" } }),
  );
  await page.reload();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.getByRole("status", { name: "アプリを読み込み中" })).toHaveCount(0);
  await expect(page.locator(".v2-app").getByRole("alert")).toContainText("グループ取得失敗");
  await page.unroute("**/api/groups");
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.locator(".group-carousel .community-card")).toContainText("0人");
});

test("全所属の活動を一度で取得し、切替後も保持して503と403を区別する", async ({ page }) => {
  const state = await mockTraining(page);
  const groups = [
    state.group,
    ...["b", "c", "d"].map((id) => ({ ...state.group, id, name: `グループ${id}` })),
  ];
  let reads = 0;
  let status = 200;
  let release = () => {};
  let gate = Promise.resolve();
  await page.route("**/api/groups", (route) => route.fulfill({ json: groups }));
  await page.route("**/api/groups/today-activity", async (route) => {
    reads++;
    await gate;
    const activity = emptyTodayActivity(groups);
    activity.groups[1].member_count = 3;
    activity.groups[1].today_count = 3;
    return route.fulfill({
      status,
      json: status === 200 ? activity : { detail: "活動を取得できません" },
    });
  });
  try {
    await page.reload();
    await expect(page.getByRole("navigation")).toBeVisible();
    expect(reads).toBe(1);
    await page.getByRole("button", { name: "グループbを表示", exact: true }).click();
    const card = page.getByRole("button", { name: "グループbの詳細", exact: true });
    await expect(card).toContainText("3人");
    expect(reads).toBe(1);
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => reads).toBe(2);
    await expect(card).toContainText("3人");
    status = 503;
    release();
    await expect(page.locator(".v2-app").getByRole("alert")).toContainText(
      "前回の内容を表示しています",
    );
    await expect(card).toContainText("3人");
    status = 403;
    await page.getByRole("button", { name: "今日の活動を再試行", exact: true }).click();
    await expect(page.locator(".v2-app").getByRole("alert")).not.toContainText(
      "前回の内容を表示しています",
    );
    await expect(card).not.toContainText("3人");
  } finally {
    release();
  }
});

test("初回集約取得の期限切れ後は再試行でき、切替で多重取得しない", async ({ page }) => {
  await page.clock.install();
  const state = await mockTraining(page);
  const groups = [state.group, { ...state.group, id: "next", name: "隣" }];
  let reads = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/groups", (route) => route.fulfill({ json: groups }));
  await page.route("**/api/groups/today-activity", async (route) => {
    reads++;
    await gate;
    const activity = emptyTodayActivity(groups);
    activity.groups[1].member_count = 3;
    activity.groups[1].today_count = 3;
    return route.fulfill({ json: activity });
  });
  try {
    await page.reload();
    await expect.poll(() => reads).toBe(1);
    await expect(page.getByRole("status", { name: "アプリを読み込み中" })).toBeVisible();
    await page.clock.runFor(15_100);
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.getByRole("button", { name: "隣を表示", exact: true }).click();
    expect(reads).toBe(1);
    await page.getByRole("button", { name: "今日の活動を再試行", exact: true }).click();
    await expect.poll(() => reads).toBe(2);
    release();
    await expect(page.getByRole("button", { name: "隣の詳細", exact: true })).toContainText("3人");
    expect(reads).toBe(2);
  } finally {
    release();
  }
});

test("初回通信が止まっても15秒で再試行でき、復帰後に起動画面へ戻らない", async ({ page }) => {
  await page.clock.install();
  await mockTraining(page);
  let reads = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/groups", async (route) => {
    reads++;
    await gate;
    await route.fallback();
  });
  try {
    await page.reload();
    await expect.poll(() => reads).toBe(1);
    await expect(page.getByRole("status", { name: "アプリを読み込み中" })).toBeVisible();
    await page.clock.runFor(15_100);
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.locator(".v2-app").getByRole("alert")).toContainText("再試行してください");
    release();
    await page.unroute("**/api/groups");
    await page.getByRole("button", { name: "再試行", exact: true }).click();
    await expect(page.locator(".group-carousel .community-card")).toContainText("0人");
    await expect(page.getByRole("status", { name: "アプリを読み込み中" })).toHaveCount(0);
  } finally {
    release();
  }
});
