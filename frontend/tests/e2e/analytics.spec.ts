import { type Page, expect, test } from "@playwright/test";
import type { Analytics, Point } from "../../src/features/analytics/types";
import { mockTraining, navigate, openGroup } from "./mock-training";
import { backendUrl } from "./test-server";

function fixture(url: URL, group = false): Analytics {
  const exercise = url.searchParams.get("exercise");
  const period = (url.searchParams.get("period") ?? "month") as Analytics["window"]["period"];
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const points: Point[] = Array.from({ length: 11 }, (_, i) => ({
    start: `2026-09-${String(i + 1).padStart(2, "0")}`,
    end: `2026-09-${String(i + 1).padStart(2, "0")}`,
    volume: i % 3 === 0 ? 0 : 1800 + i * 230,
    sets: i % 3 === 0 ? 0 : 4 + i,
    days: i % 3 === 0 ? 0 : 1,
    people: i % 3 === 0 ? 0 : 2,
    weight: i % 3 === 0 || !exercise ? null : 60 + i * 2.5,
    rm: i % 3 === 0 || !exercise ? null : 72 + i * 3,
  }));
  const rank = [
    { user_id: "a", display_name: "タクミ", value: 12500, rank: 1, status: "recorded" as const },
    { user_id: "b", display_name: "ハル", value: 11000, rank: 2, status: "recorded" as const },
  ];
  const weeklyGroup = group && period === "week";
  const shownPoints = weeklyGroup ? points.slice(6) : points;
  const totalVolume = shownPoints.reduce((total, point) => total + (point.volume ?? 0), 0);
  const totalSets = shownPoints.reduce((total, point) => total + (point.sets ?? 0), 0);
  return {
    window: {
      period,
      offset,
      start: weeklyGroup ? "2026-09-07" : "2026-09-01",
      end: "2026-09-11",
      previous_start: weeklyGroup ? "2026-08-31" : "2026-08-01",
      previous_end: weeklyGroup ? "2026-09-04" : "2026-08-11",
      can_previous: true,
    },
    exercise,
    exercises: ["ベンチプレス", "スクワット"],
    totals: {
      volume: weeklyGroup ? totalVolume : 23500,
      sets: weeklyGroup ? totalSets : 40,
      days: 8,
      people: 2,
      weight: exercise ? 85 : null,
      rm: exercise ? 102 : null,
    },
    previous_totals: {
      volume: 18000,
      sets: 32,
      days: 6,
      people: 2,
      weight: exercise ? 80 : null,
      rm: exercise ? 96 : null,
    },
    series: {
      day: shownPoints,
      week: [{ ...points[1], start: "2026-09-01", end: "2026-09-07", volume: 14000 }],
      month: [{ ...points[1], start: "2026-09-01", end: "2026-09-11", volume: 23500 }],
    },
    rankings: group
      ? {
          volume: rank.map((r, i) => ({
            ...r,
            value: weeklyGroup ? totalVolume / 2 + (i === 0 ? 100 : -100) : r.value,
          })),
          sets: rank.map((r) => ({ ...r, value: 20, rank: 1 })),
          days: rank.map((r) => ({ ...r, value: 8, rank: 1 })),
          weight: rank.map((r) => ({ ...r, value: 85, rank: 1 })),
          rm: rank.map((r) => ({ ...r, value: 102, rank: 1 })),
          weight_growth: rank.map((r) => ({ ...r, value: 5, rank: 1 })),
          weight_percent: rank.map((r) => ({ ...r, value: 6.3, rank: 1 })),
        }
      : {},
  };
}

async function routes(page: Page) {
  let requests = 0;
  let selectedRequests = 0;
  let slow = false;
  let forbidden = false;
  await page.route(/\/api\/(groups\/[^/]+\/)?analytics\?/, async (route) => {
    const url = new URL(route.request().url());
    if (
      url.searchParams.get("period") === "all" &&
      url.searchParams.get("offset") === "0" &&
      !url.searchParams.get("exercise")
    )
      requests++;
    if (
      url.searchParams.get("period") === "month" &&
      url.searchParams.get("exercise") === "ベンチプレス"
    )
      selectedRequests++;
    if (slow) await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill(
      forbidden
        ? { status: 404, json: { detail: "グループに参加していません" } }
        : {
            json: fixture(
              new URL(route.request().url()),
              route.request().url().includes("/groups/"),
            ),
          },
    );
  });
  return {
    count: () => requests,
    selectedCount: () => selectedRequests,
    slow: () => {
      slow = true;
    },
    forbid: () => {
      forbidden = true;
    },
  };
}

for (const view of ["履歴グラフ", "グループグラフ", "部位別グループグラフ"] as const) {
  test(`${view}の初回取得失敗から再試行できる`, async ({ page }) => {
    await mockTraining(page, true, false, false);
    let failed = true;
    await page.route(/\/api\/(groups\/[^/]+\/)?analytics\?/, (route) =>
      route.fulfill(
        failed
          ? { status: 503, json: { detail: "集計を取得できません" } }
          : { json: fixture(new URL(route.request().url()), view !== "履歴グラフ") },
      ),
    );
    if (view === "履歴グラフ") {
      await navigate(page, "履歴");
      await page.getByRole("tab", { name: "グラフ" }).click();
    } else {
      await openGroup(page);
      await page
        .getByRole("navigation", { name: "グループの表示" })
        .getByRole("button", { name: "グラフ" })
        .click();
    }
    const panel = page.locator(
      view === "履歴グラフ" ? ".personal-history-panel" : ".group-history-graph",
    );
    if (view === "部位別グループグラフ")
      await panel.getByRole("button", { name: "胸", exact: true }).click();
    await expect(
      panel.getByRole("button", { name: "グラフを取得できません。再試行" }),
    ).toBeVisible();
    await expect(panel.getByRole("img")).toHaveCount(0);
    failed = false;
    await panel.getByRole("button", { name: "グラフを取得できません。再試行" }).click();
    await expect(panel.getByRole("img", { name: "総負荷の推移" })).toBeVisible();
    await expect(panel.locator(".personal-history-graph-value")).toContainText("23,500");
  });
}

test("取得した個人グラフの指標と期間を追加通信なしで切り替える", async ({ page }) => {
  await mockTraining(page, true, false, false);
  const state = await routes(page);
  await navigate(page, "履歴");
  await page.getByRole("tab", { name: "グラフ" }).click();
  const panel = page.locator(".personal-history-panel");
  await expect(panel.getByRole("img", { name: "総負荷の推移" })).toBeVisible();
  await expect(panel.locator(".personal-history-graph-value")).toContainText("23,500");
  const before = state.count();
  state.slow();
  await panel.getByRole("button", { name: "最大重量", exact: true }).click();
  await expect(panel.getByRole("img", { name: "最大重量の推移" })).toBeVisible();
  await panel.getByRole("button", { name: "総負荷", exact: true }).click();
  await panel.getByRole("button", { name: "週", exact: true }).click();
  await expect(panel.locator(".personal-history-graph-value")).toContainText("14,000");
  await panel.getByRole("button", { name: "月", exact: true }).click();
  await panel.getByRole("button", { name: "総負荷", exact: true }).click();
  await expect(panel.locator(".personal-history-graph-value")).toContainText("23,500");
  expect(state.count()).toBe(before);
});

test("グループ集計の権限喪失後は以前のグラフを消し、再訪でも復元しない", async ({ page }) => {
  await mockTraining(page);
  const state = await routes(page);
  await openGroup(page);
  const tabs = page.getByRole("navigation", { name: "グループの表示" });
  await tabs.getByRole("button", { name: "グラフ" }).click();
  const panel = page.locator(".group-history-graph");
  await expect(panel.getByRole("img")).toBeVisible();
  state.forbid();
  await panel.getByRole("button", { name: "胸", exact: true }).click();
  await expect(panel.getByRole("button", { name: "グラフを取得できません。再試行" })).toBeVisible();
  await expect(panel.getByRole("img")).toHaveCount(0);
  await panel.getByRole("button", { name: "すべて", exact: true }).click();
  await expect(panel.getByRole("img")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "グラフを取得できません。再試行" })).toBeVisible();
});

test("実DBの個人グラフは非公開も集計し、グループのランキングは共有記録だけを表示する", async ({
  page,
}) => {
  const { localAuth, testPassword } = await import("./local-auth");
  const { admin, publicAuth } = localAuth();
  const email = `gotore-analytics-${crypto.randomUUID()}@example.test`;
  const created = await admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
    user_metadata: { display_name: "集計テスト" },
  });
  expect(created.error).toBeNull();
  const signed = await publicAuth.signInWithPassword({ email, password: testPassword });
  if (!signed.data.session) throw new Error("テスト用ログインに失敗しました");
  const headers = { Authorization: `Bearer ${signed.data.session.access_token}` };
  const groupResponse = await page.request.post(`${backendUrl}/api/groups`, {
    headers,
    data: { name: "集計確認部" },
  });
  expect(groupResponse.status()).toBe(201);
  const group = await groupResponse.json();
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  for (const [groupId, weight] of [
    [group.id, 80],
    [null, 60],
  ] as const) {
    const response = await page.request.post(`${backendUrl}/api/workouts`, {
      headers,
      data: {
        id: crypto.randomUUID(),
        group_id: groupId,
        performed_on: day,
        exercises: [{ name: "ベンチプレス", sets: [{ weight, reps: 10 }] }],
      },
    });
    expect(response.status()).toBe(201);
  }
  await page.goto("/");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "スキップ", exact: true }).click();
  await navigate(page, "履歴");
  await page.getByRole("tab", { name: "グラフ", exact: true }).click();
  await expect(page.locator(".personal-history-graph-value")).toContainText("1,400");
  await openGroup(page);
  const response = await page.request.get(
    `${backendUrl}/api/groups/${group.id}/analytics?period=all&offset=0`,
    { headers },
  );
  expect(response.ok()).toBe(true);
  const aggregate = await response.json();
  expect(aggregate.totals.volume).toBe(800);
  expect(aggregate.rankings.volume).toEqual([
    expect.objectContaining({ display_name: "集計テスト", value: 800 }),
  ]);
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "グラフ", exact: true })
    .click();
  await expect(page.locator(".group-history-graph .personal-history-graph-value")).toContainText(
    "800",
  );
});

test("グループ集計を保持し、タブ再訪後の再照合でも指標を戻さない", async ({ page }) => {
  await page.clock.install();
  await mockTraining(page);
  const state = await routes(page);
  await openGroup(page);
  const tabs = page.getByRole("navigation", { name: "グループの表示" });
  await tabs.getByRole("button", { name: "グラフ" }).click();
  const panel = page.locator(".group-history-graph");
  await expect(panel.locator(".personal-history-graph-value")).toContainText("23,500");
  await panel.getByRole("button", { name: "セット数", exact: true }).click();
  await expect(panel.getByRole("img", { name: "セット数の推移" })).toBeVisible();
  const before = state.count();
  await page.clock.runFor(5000);
  expect(state.count()).toBe(before);
  await tabs.getByRole("button", { name: "最新記録" }).click();
  await page.clock.runFor(65_000);
  expect(state.count()).toBe(before);
  state.slow();
  await tabs.getByRole("button", { name: "グラフ" }).click();
  await expect(panel.getByRole("img", { name: "セット数の推移" })).toBeVisible({ timeout: 500 });
  await expect.poll(state.count).toBeGreaterThan(before);
});
