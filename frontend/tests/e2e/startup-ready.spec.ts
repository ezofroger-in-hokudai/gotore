import { expect, test } from "@playwright/test";
import { mockTraining, navigate } from "./mock-training";

test("初回のグループと種目を準備してからホームを表示する", async ({ page }) => {
  const state = await mockTraining(page);
  let releaseFeed = () => {};
  let releaseOptions = () => {};
  const feed = new Promise<void>((resolve) => {
    releaseFeed = resolve;
  });
  const options = new Promise<void>((resolve) => {
    releaseOptions = resolve;
  });
  let requested = 0;
  await page.route(`**/api/groups/${state.group.id}/activity`, async (route) => {
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
    await expect(page.locator(".community-total")).toContainText("1人");
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
  await expect(page.locator(".community-total")).toContainText("1人");
});

test("隣を先読みし、切替先の確認が遅くても記録を即時表示する", async ({ page }) => {
  const state = await mockTraining(page);
  const groups = [
    state.group,
    ...["b", "c", "d"].map((id) => ({ ...state.group, id, name: `グループ${id}` })),
  ];
  const counts = new Map<string, number>();
  let held = false;
  let denied = false;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/groups", (route) => route.fulfill({ json: groups }));
  await page.route("**/api/groups/activity/summary", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/groups/*/activity", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3];
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (held && id === "b") await gate;
    if (denied && id === "b")
      return route.fulfill({ status: 403, json: { detail: "共有を閲覧できません" } });
    await route.fulfill({
      json: {
        group_id: id,
        member_count: 1,
        live_count: 0,
        today_count: 0,
        members: [],
        feed: [
          {
            workout_id: id,
            user_id: state.user.id,
            display_name: "本人",
            exercise: `記録${id}`,
            weight: 20,
            reps: 10,
            estimated_rm: null,
            updated_at: new Date().toISOString(),
            best: false,
          },
        ],
      },
    });
  });
  try {
    await page.reload();
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect.poll(() => counts.get("b")).toBe(1);
    // 先読みがブラウザへ届いたことを保証してから、確認要求を保留する。
    await page.waitForTimeout(100);
    expect(counts.get("c")).toBeUndefined();
    expect(counts.get("d")).toBeUndefined();
    held = true;
    await page.getByRole("button", { name: "グループbを表示", exact: true }).click();
    await expect.poll(() => counts.get("b")).toBe(2);
    await expect(page.getByRole("article")).toContainText("記録b");
    await expect(page.getByRole("status", { name: "グループの記録を読み込み中" })).toHaveCount(0);
    denied = true;
    release();
    await expect(page.locator(".v2-app").getByRole("alert")).toContainText("共有を閲覧できません");
    await expect(page.getByRole("article")).toHaveCount(0);
    await page.getByRole("button", { name: `${state.group.name}を表示`, exact: true }).click();
    await expect(page.getByRole("article")).toContainText(`記録${state.group.id}`);
  } finally {
    release();
  }
});

test("先読み中の隣へ切り替えても同じ取得を引き継ぐ", async ({ page }) => {
  const state = await mockTraining(page);
  let reads = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/groups", (route) =>
    route.fulfill({ json: [state.group, { ...state.group, id: "next", name: "隣" }] }),
  );
  await page.route("**/api/groups/activity/summary", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/groups/next/activity", async (route) => {
    reads++;
    await gate;
    await route.fulfill({
      json: {
        group_id: "next",
        member_count: 3,
        live_count: 0,
        today_count: 0,
        members: [],
        feed: [],
      },
    });
  });
  try {
    await page.reload();
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect.poll(() => reads).toBe(1);
    await page.getByRole("button", { name: "隣を表示", exact: true }).click();
    await expect(page.getByRole("status", { name: "グループの記録を読み込み中" })).toBeVisible();
    release();
    await expect(page.getByRole("button", { name: "隣の詳細", exact: true })).toContainText("3人");
    expect(reads).toBe(1);
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
    await expect(page.locator(".community-total")).toContainText("1人");
    await expect(page.getByRole("status", { name: "アプリを読み込み中" })).toHaveCount(0);
  } finally {
    release();
  }
});
