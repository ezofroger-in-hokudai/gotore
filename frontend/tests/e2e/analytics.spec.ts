import { type Page, expect, test } from "@playwright/test";
import type { Analytics, Point } from "../../src/features/analytics/types";
import { mockTraining, navigate, openGroup } from "./mock-training";

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
    requests++;
    const url = new URL(route.request().url());
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

test("先読みした履歴グラフを表示し、指標・粒度・期間再訪を待たずに切り替える", async ({ page }) => {
  await mockTraining(page);
  const state = await routes(page);
  await expect.poll(state.count).toBeGreaterThan(0);
  await navigate(page, "履歴");
  await page.getByRole("button", { name: "グラフ", exact: true }).click();
  const panel = page.getByRole("region", { name: "履歴グラフ" });
  await expect(panel.locator(".analytics-summary")).toContainText("23,500");
  await panel.getByRole("combobox", { name: "種目", exact: true }).selectOption("ベンチプレス");
  await expect(panel.locator(".analytics-summary")).toContainText("23,500");
  state.slow();
  const before = state.selectedCount();
  await panel.getByRole("button", { name: "最高重量", exact: true }).click();
  await expect(panel.locator(".analytics-summary")).toContainText("85", { timeout: 500 });
  await panel.getByRole("button", { name: "週別", exact: true }).click();
  await expect(panel.getByRole("slider")).toHaveAttribute("max", "0", { timeout: 500 });
  expect(state.selectedCount()).toBe(before);
  await panel.getByRole("combobox", { name: "期間", exact: true }).selectOption("year");
  await expect(panel.locator(".analytics-summary")).toBeVisible();
  await panel.getByRole("combobox", { name: "期間", exact: true }).selectOption("month");
  await expect(panel.locator(".analytics-summary")).toContainText("85", { timeout: 500 });
  await panel.getByRole("button", { name: "この期間の記録を見る" }).click();
  await expect(
    page.getByRole("heading", { name: "2026/09/01 〜 2026/09/07", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "すべての記録", exact: true })).toBeVisible();
});

test("グループのグラフとランキングを共有し、権限喪失後はキャッシュも消す", async ({ page }) => {
  await mockTraining(page);
  const state = await routes(page);
  await openGroup(page);
  await page.getByRole("button", { name: "ランキング", exact: true }).click();
  const panel = page.getByRole("region", { name: "グループ集計" });
  await expect(panel.getByRole("list")).toContainText("タクミ");
  await panel.getByRole("button", { name: "セット数", exact: true }).click();
  await expect(panel.locator(".rank-position")).toHaveText(["1", "1"]);
  await page.getByRole("button", { name: "グラフ", exact: true }).click();
  await expect(panel.getByRole("img")).toBeVisible({ timeout: 500 });
  await panel.getByRole("combobox", { name: "種目", exact: true }).selectOption("ベンチプレス");
  await expect(panel.locator(".analytics-summary")).toBeVisible();
  state.forbid();
  await panel.getByRole("combobox", { name: "期間", exact: true }).selectOption("all");
  await expect(panel.getByRole("alert")).toContainText("参加していません");
  await panel.getByRole("combobox", { name: "期間", exact: true }).selectOption("week");
  await expect(panel.getByRole("img")).toHaveCount(0);
  await expect(panel.getByRole("alert")).toContainText("参加していません");
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
  const groupResponse = await page.request.post("http://127.0.0.1:8100/api/groups", {
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
    const response = await page.request.post("http://127.0.0.1:8100/api/workouts", {
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
  await page.getByRole("button", { name: "グラフ", exact: true }).click();
  await expect(page.locator(".history-screen .analytics-summary")).toContainText("1,400");
  await openGroup(page);
  await page.getByRole("button", { name: "ランキング", exact: true }).click();
  await expect(page.locator(".analytics-ranks")).toContainText("集計テスト");
  await expect(page.locator(".analytics-ranks")).toContainText("800");
  await page.getByRole("button", { name: "グラフ", exact: true }).click();
  await expect(page.locator(".community-screen .analytics-summary")).toContainText("800");
});

test("グループの集計を60秒保持し、グラフとランキングの切替で再取得しない", async ({ page }) => {
  await page.clock.install();
  await mockTraining(page);
  const state = await routes(page);
  await openGroup(page);
  await page.getByRole("button", { name: "グラフ", exact: true }).click();
  const panel = page.getByRole("region", { name: "グループ集計" });
  await panel.getByRole("combobox", { name: "期間", exact: true }).selectOption("month");
  await panel.getByRole("combobox", { name: "種目", exact: true }).selectOption("ベンチプレス");
  await expect(panel.locator(".analytics-summary")).toContainText("23,500");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const before = state.selectedCount();
  await page.clock.runFor(5000);
  expect(state.selectedCount()).toBe(before);
  await page.getByRole("button", { name: "ランキング", exact: true }).click();
  await expect(panel.locator(".analytics-ranks")).toContainText("タクミ");
  await page.getByRole("button", { name: "グラフ", exact: true }).click();
  await expect(panel.locator(".analytics-summary")).toContainText("23,500");
  expect(state.selectedCount()).toBe(before);
  await page.clock.runFor(55_000);
  await expect.poll(state.selectedCount).toBe(before + 1);
});
