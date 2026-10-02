import { PNG } from "pngjs";
import { expect, test } from "./fixtures";
import { mockTraining, navigate, openGroup } from "./mock-training";

test("採用した履歴の通算・部位・カレンダー・グラフ・人体図を切り替えられる", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
  await mockTraining(page);
  const requested: string[] = [];
  await page.route("**/api/history/summary", (route) =>
    route.fulfill({
      json: {
        workout_count: 12,
        total_sets: 84,
        total_volume: 12345,
        first_performed_on: "2026-01-01",
        exercises: [
          { name: "ベンチプレス", body_part: "chest", last_performed_on: "2026-09-28" },
          { name: "スクワット", body_part: "legs", last_performed_on: "2026-09-27" },
        ],
      },
    }),
  );
  await page.route("**/api/workouts/activity?*", (route) => {
    const url = new URL(route.request().url());
    requested.push(url.search);
    const month = url.searchParams.get("month");
    return route.fulfill({
      json: {
        month,
        metric: "volume",
        total_volume: 600,
        total_sets: 2,
        workout_count: 1,
        active_days: month === "2026-09" ? 4 : 0,
        days:
          month === "2026-09"
            ? [
                {
                  date: "2026-09-25",
                  volume: 400,
                  set_count: 2,
                  workout_count: 1,
                  body_parts: [{ body_part: "legs", volume: 400, set_count: 2, workout_count: 1 }],
                },
                {
                  date: "2026-09-26",
                  volume: 400,
                  set_count: 2,
                  workout_count: 1,
                  body_parts: [{ body_part: "back", volume: 400, set_count: 2, workout_count: 1 }],
                },
                {
                  date: "2026-09-27",
                  volume: 400,
                  set_count: 2,
                  workout_count: 1,
                  body_parts: [
                    { body_part: "shoulders", volume: 400, set_count: 2, workout_count: 1 },
                  ],
                },
                {
                  date: "2026-09-28",
                  volume: 600,
                  set_count: 2,
                  workout_count: 1,
                  body_parts: [
                    { body_part: "chest", volume: 600, set_count: 2, workout_count: 1 },
                    { body_part: "glutes", volume: 200, set_count: 1, workout_count: 1 },
                  ],
                },
              ]
            : [],
      },
    });
  });
  await page.route("**/api/analytics?*", (route) => {
    const url = new URL(route.request().url());
    requested.push(url.search);
    const series = Array.from({ length: 8 }, (_, index) => ({
      start: `2026-${String(index + 2).padStart(2, "0")}-01`,
      end: `2026-${String(index + 2).padStart(2, "0")}-28`,
      volume: (index + 1) * 100,
      sets: 2,
      days: 1,
      people: 1,
      weight: 50 + index,
      weight_exercise: "スクワット",
      rm: 60 + index,
      rm_exercise: "スクワット",
    }));
    return route.fulfill({
      json: {
        window: {
          period: url.searchParams.get("period"),
          offset: 0,
          start: "2026-04-01",
          end: "2026-09-28",
          previous_start: null,
          previous_end: null,
          can_previous: true,
        },
        exercise: url.searchParams.get("exercise"),
        exercises: ["ベンチプレス", "スクワット"],
        totals: { volume: 2100, sets: 12, days: 6, people: 1, weight: 55, rm: 65 },
        previous_totals: null,
        series: { week: series, month: series },
        rankings: {},
      },
    });
  });
  await page.route("**/api/workouts?*", (route) => {
    if (!new URL(route.request().url()).searchParams.has("performed_on")) return route.fallback();
    return route.fulfill({
      json: [
        {
          id: "history-day-record",
          user_id: "00000000-0000-0000-0000-000000000001",
          display_name: "画面テスト",
          group_id: null,
          performed_on: "2026-09-28",
          created_at: "2026-09-28T03:00:00Z",
          revision: 1,
          exercises: [
            {
              name: "ベンチプレス",
              sets: [
                { weight: 60, reps: 10 },
                { weight: 65, reps: 8 },
              ],
            },
            { name: "スクワット", sets: [{ weight: 100, reps: 5 }] },
          ],
        },
      ],
    });
  });
  await navigate(page, "履歴");
  await expect(page.locator(".personal-history-summary")).toContainText("12,345");
  await expect(page.locator(".personal-history-summary")).toContainText("12回");
  await expect(page.locator(".personal-history-days button")).toHaveCount(30);
  const layout = await page.locator(".personal-history-calendar").evaluate((element) => ({
    card: element.getBoundingClientRect().toJSON(),
    days: element.querySelector(".personal-history-days")?.getBoundingClientRect().toJSON(),
    foot: element
      .querySelector(".personal-history-calendar-foot")
      ?.getBoundingClientRect()
      .toJSON(),
  }));
  expect(layout.foot?.bottom).toBeLessThan(layout.card.bottom);
  expect(layout.card.bottom).toBeLessThanOrEqual(
    await page.locator(".bottom-nav").evaluate((element) => element.getBoundingClientRect().top),
  );
  const calendar = page.locator(".personal-history-calendar");
  await calendar.dispatchEvent("pointerdown", { clientX: 160, clientY: 400 });
  await calendar.dispatchEvent("pointerup", { clientX: 260, clientY: 401 });
  await expect(page.locator(".personal-history-month strong")).toHaveText("2026年8月");
  await calendar.locator("button").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".personal-history-month strong")).toHaveText("2026年9月");
  await page.locator(".personal-history-days button").filter({ hasText: "28" }).click();
  await expect(page.getByText("2026年9月28日の全メニュー")).toBeVisible();
  await expect(page.locator(".record-review.is-compact")).toHaveCount(1);
  await expect(page.getByRole("table", { name: "ベンチプレス" }).locator("tbody tr")).toHaveCount(
    2,
  );
  await expect(page.getByRole("table", { name: "スクワット" }).locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("button", { name: "胸", exact: true }).first().click();
  await page.getByRole("button", { name: "ベンチプレス", exact: true }).click();
  await expect
    .poll(() => requested.some((query) => query.includes("exercise=%E3%83%99")))
    .toBe(true);
  await page.getByRole("tab", { name: "グラフ" }).click();
  await expect(page.getByRole("img", { name: "総負荷の推移" })).toBeVisible();
  await expect(page.locator(".personal-history-graph-value strong")).toContainText("800");
  await expect(page.locator(".personal-history-graph-period")).toHaveText("2026年4月–2026年9月");
  const monthWidth = await page
    .locator(".personal-history-plot-track")
    .evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("button", { name: "全期間" }).click();
  await expect(page.locator(".personal-history-graph-value strong")).toContainText("800");
  await expect(page.locator(".personal-history-graph-period")).toHaveText("2026年2月–2026年9月");
  const allWidth = await page
    .locator(".personal-history-plot-track")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(allWidth).toBeLessThan(monthWidth);
  await page.getByRole("button", { name: "月", exact: true }).click();
  const plot = page.locator(".personal-history-plot-scroll");
  await expect
    .poll(() => plot.evaluate((element) => element.scrollWidth > element.clientWidth))
    .toBe(true);
  const initialScroll = await plot.evaluate((element) => element.scrollLeft);
  const bounds = await plot.boundingBox();
  if (!bounds) throw new Error("グラフの表示範囲がありません");
  const touch = await page.context().newCDPSession(page);
  await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const y = bounds.y + bounds.height / 2;
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: bounds.x + 70, y }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: bounds.x + 120, y }],
  });
  await page.waitForTimeout(50);
  const midpoint = await plot.evaluate((element) => element.scrollLeft);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: bounds.x + 170, y }],
  });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect
    .poll(() => plot.evaluate((element) => element.scrollLeft))
    .toBeLessThan(initialScroll);
  expect(midpoint).toBeLessThan(initialScroll);
  expect(midpoint).toBeGreaterThan(0);
  expect(await plot.locator(".personal-history-trend").count()).toBe(1);
  const main = page.locator(".personal-history-view .main-content");
  await main.evaluate((element) => {
    element.scrollTop = 0;
  });
  const plotBounds = await plot.boundingBox();
  if (!plotBounds) throw new Error("グラフの表示範囲がありません");
  const touchX = plotBounds.x + plotBounds.width / 2;
  const touchY = plotBounds.y + plotBounds.height / 2;
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touchX, y: touchY }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchX, y: touchY - 120 }],
  });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(40);
  await main.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByRole("button", { name: "最大重量" }).click();
  await expect(page.getByRole("img", { name: "最大重量の推移" })).toBeVisible();
  await page.getByRole("button", { name: "全期間" }).click();
  await expect(page.locator(".personal-history-graph-value")).toContainText("57");
  await page.getByRole("button", { name: "すべて", exact: true }).click();
  await expect(page.locator(".personal-history-graph-value")).toContainText("スクワット");
  await page.screenshot({ path: "test-results/personal-history-graph.png" });
  await page.getByRole("tab", { name: "使った部位" }).click();
  await expect(page.locator(".personal-history-body-tags")).toContainText("胸");
  await expect(page.locator(".personal-history-body-base")).toHaveCount(1);
  await expect(page.locator('.personal-history-body-region[data-age="0"]')).toHaveCount(4);
  await expect(page.locator('.personal-history-body-region[data-age="3"]')).toHaveCount(4);
  await expect(page.locator('.personal-history-body-region[data-part="glutes"]')).toHaveCount(2);
  const bodyImageRatio = await page.locator(".personal-history-body-image").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width / bounds.height;
  });
  expect(bodyImageRatio).toBeCloseTo(1223 / 1286, 2);
  await expect(page.locator('.personal-history-body-region[data-age="0"]').first()).toHaveCSS(
    "opacity",
    "1",
  );
  await page.screenshot({ path: "test-results/personal-history-body.png" });

  await page.getByRole("button", { name: "胸", exact: true }).first().click();
  await page.getByRole("button", { name: "ベンチプレス", exact: true }).click();
  await page
    .getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("button", { name: "履歴", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "すべて", exact: true }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "全種目", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("tab", { name: "カレンダー" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("履歴のカード・タブ・グラフはダークテーマの共通色を使う", async ({ page }) => {
  await mockTraining(page);
  await navigate(page, "履歴");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await expect
    .poll(() =>
      page
        .locator(".personal-history-card")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe("rgb(27, 29, 32)");
  await expect
    .poll(() =>
      page
        .locator(".personal-history-tabs")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe("rgb(40, 43, 49)");
});

test("肩だけを使った日は左右の肩を塗り、腕には広がらない", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
  await mockTraining(page);
  await page.route("**/api/workouts/activity?*", (route) => {
    const month = new URL(route.request().url()).searchParams.get("month");
    return route.fulfill({
      json: {
        month,
        metric: "volume",
        total_volume: 100,
        total_sets: 1,
        workout_count: 1,
        active_days: month === "2026-09" ? 1 : 0,
        days:
          month === "2026-09"
            ? [
                {
                  date: "2026-09-28",
                  volume: 100,
                  set_count: 1,
                  workout_count: 1,
                  body_parts: [
                    { body_part: "shoulders", volume: 100, set_count: 1, workout_count: 1 },
                  ],
                },
              ]
            : [],
      },
    });
  });
  await navigate(page, "履歴");
  await page.getByRole("tab", { name: "使った部位" }).click();
  await expect(page.locator('.personal-history-body-region[data-part="shoulders"]')).toHaveCount(4);
  await expect(page.locator('.personal-history-body-region[data-part="arms"]')).toHaveCount(0);
  await page.screenshot({ path: "test-results/personal-history-shoulders.png" });
});

for (const part of ["chest", "back", "shoulders", "arms", "abs", "glutes", "legs"] as const) {
  test(`${part}だけを使った人体図を確認する`, async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
    await mockTraining(page);
    await page.route("**/api/workouts/activity?*", (route) => {
      const month = new URL(route.request().url()).searchParams.get("month");
      return route.fulfill({
        json: {
          month,
          metric: "volume",
          total_volume: 100,
          total_sets: 1,
          workout_count: 1,
          active_days: month === "2026-09" ? 1 : 0,
          days:
            month === "2026-09"
              ? [
                  {
                    date: "2026-09-28",
                    volume: 100,
                    set_count: 1,
                    workout_count: 1,
                    body_parts: [{ body_part: part, volume: 100, set_count: 1, workout_count: 1 }],
                  },
                ]
              : [],
        },
      });
    });
    await navigate(page, "履歴");
    await page.getByRole("tab", { name: "使った部位" }).click();
    await expect(page.locator(`.personal-history-body-region[data-part="${part}"]`)).toHaveCount(
      { chest: 2, back: 1, shoulders: 4, arms: 4, abs: 1, glutes: 2, legs: 4 }[part],
    );
    await expect(
      page.locator(`.personal-history-body-region:not([data-part="${part}"])`),
    ).toHaveCount(0);
    const image = await page.locator(".personal-history-body-image").screenshot({
      path: `test-results/history-part-${part}.png`,
    });
    if (part === "arms") {
      const pixels = PNG.sync.read(image);
      for (const x of [50, 152]) {
        const index = (98 * pixels.width + x) * 4;
        expect(pixels.data[index] - pixels.data[index + 1]).toBeGreaterThan(20);
      }
    }
  });
}

for (const width of [320, 430]) {
  test(`${width}pxでも履歴のカードと3タブが下部ナビに重ならない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
    await mockTraining(page);
    await navigate(page, "履歴");
    const navTop = await page
      .locator(".bottom-nav")
      .evaluate((element) => element.getBoundingClientRect().top);
    for (const tab of ["カレンダー", "グラフ", "使った部位"]) {
      await page.getByRole("tab", { name: tab }).click();
      const panelBottom = await page
        .locator(".personal-history-card")
        .evaluate((element) => element.getBoundingClientRect().bottom);
      expect(panelBottom).toBeLessThanOrEqual(navTop);
      await expect(page.locator(".personal-history-card")).toBeVisible();
      if (tab === "使った部位") {
        const ratio = await page.locator(".personal-history-body-image").evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width / bounds.height;
        });
        expect(ratio).toBeCloseTo(1223 / 1286, 2);
      }
    }
  });
}

test("履歴は初期表示を一画面に収めつつ、グラフを上へスクロールできる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await mockTraining(page);
  await navigate(page, "履歴");
  await page.getByRole("tab", { name: "グラフ" }).click();
  const main = page.locator(".personal-history-view .main-content");
  const graph = page.locator(".personal-history-card");
  const nav = page.locator(".bottom-nav");
  await main.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);
  const initialGraph = await graph.boundingBox();
  const initialNav = await nav.boundingBox();
  if (!initialGraph || !initialNav) throw new Error("履歴の初期配置を取得できません");
  expect(initialGraph.y + initialGraph.height).toBeLessThanOrEqual(initialNav.y);
  await expect
    .poll(() => main.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(100);
  await main.evaluate((element) => {
    element.scrollTop = 120;
  });
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(90);
  const scrolledGraph = await graph.boundingBox();
  const scrolledNav = await nav.boundingBox();
  if (!scrolledGraph || !scrolledNav) throw new Error("スクロール後の配置を取得できません");
  expect(scrolledGraph.y).toBeLessThan(initialGraph.y - 90);
  expect(scrolledNav.y).toBe(initialNav.y);
});

test("同じ日に50件を超える記録も省略せず表示する", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
  await mockTraining(page);
  const records = Array.from({ length: 51 }, (_, index) => ({
    id: `many-records-${index}`,
    user_id: "00000000-0000-0000-0000-000000000001",
    display_name: "画面テスト",
    group_id: null,
    performed_on: "2026-09-28",
    created_at: "2026-09-28T03:00:00Z",
    revision: 1,
    exercises: [{ name: `種目${index + 1}`, sets: [{ weight: 10, reps: 10 }] }],
  }));
  await page.route("**/api/workouts?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (!query.has("performed_on")) return route.fallback();
    const offset = Number(query.get("offset") ?? 0);
    return route.fulfill({ json: records.slice(offset, offset + 50) });
  });
  await navigate(page, "履歴");
  await page.locator(".personal-history-days button").filter({ hasText: "28" }).click();
  await expect(page.locator(".record-review")).toHaveCount(51);
  await expect(page.getByRole("heading", { name: "種目51" })).toBeVisible();
});

test("グループのグラフも連続して動き、部位だけで絞り込む", async ({ page }) => {
  await mockTraining(page);
  const requests: string[] = [];
  await page.route("**/api/groups/*/analytics?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(query.toString());
    const series = Array.from({ length: 10 }, (_, index) => ({
      start: `2026-${String(index + 1).padStart(2, "0")}-01`,
      end: `2026-${String(index + 1).padStart(2, "0")}-28`,
      volume: 100 * (index + 1),
      sets: index + 1,
      people: 2,
      days: 1,
      weight: null,
      rm: null,
    }));
    return route.fulfill({
      json: {
        window: { period: "all", start: "2026-01-01", end: "2026-10-28" },
        totals: { volume: 5500, sets: 55, people: 2, days: 10, weight: null, rm: null },
        series: { week: series, month: series },
        exercises: [],
        rankings: {},
      },
    });
  });
  await openGroup(page);
  await page
    .getByRole("navigation", { name: "グループの表示" })
    .getByRole("button", { name: "グラフ" })
    .click();
  await expect(page.getByRole("img", { name: "総負荷の推移" })).toBeVisible();
  await expect(page.getByRole("button", { name: "種目を選ぶ" })).toHaveCount(0);
  await page
    .locator(".group-history-graph .personal-history-part-tabs")
    .getByRole("button", { name: "胸" })
    .click();
  await expect.poll(() => requests.some((query) => query.includes("body_part=chest"))).toBe(true);
  const plot = page.locator(".group-history-graph .personal-history-plot-scroll");
  await expect
    .poll(() => plot.evaluate((element) => element.scrollWidth > element.clientWidth))
    .toBe(true);
  const initial = await plot.evaluate((element) => element.scrollLeft);
  await plot.hover();
  await page.mouse.wheel(-100, 0);
  await expect.poll(() => plot.evaluate((element) => element.scrollLeft)).toBeLessThan(initial);
});

test("履歴の読み込み前から日付グリッドを表示し、再訪で領域が消えない", async ({ page }) => {
  await mockTraining(page, true, false, false);
  let release = () => {};
  let gate: Promise<void> | null = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workouts/activity?*", async (route) => {
    if (gate) await gate;
    return route.fallback();
  });
  await navigate(page, "履歴");
  try {
    await expect(page.locator(".personal-history-days")).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".personal-history-calendar-foot")).toContainText("—");
    await expect(page.locator(".personal-history-days button").first()).toBeDisabled();
  } finally {
    release();
    gate = null;
  }
  await expect(page.locator(".personal-history-days button").first()).toBeEnabled();
  const height = await page
    .locator(".personal-history-days")
    .evaluate((el) => el.getBoundingClientRect().height);
  await navigate(page, "ホーム");
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await navigate(page, "履歴");
  try {
    await expect(page.locator(".personal-history-days button").first()).toBeEnabled({
      timeout: 1000,
    });
    expect(
      await page
        .locator(".personal-history-days")
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBe(height);
  } finally {
    release();
    gate = null;
  }
});

test("人体図は取得失敗を記録なしと表示せず同じタブで再試行できる", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-01T03:00:00Z"));
  await mockTraining(page, true, false, false);
  let fail = true;
  await page.route("**/api/workouts/activity?*", (route) => {
    const month = new URL(route.request().url()).searchParams.get("month");
    return route.fulfill(
      fail
        ? { status: 503, json: { detail: "活動を取得できません" } }
        : {
            json: {
              month,
              metric: "volume",
              total_volume: 100,
              total_sets: 1,
              workout_count: 1,
              active_days: 1,
              days:
                month === "2026-10"
                  ? [
                      {
                        date: "2026-10-01",
                        volume: 100,
                        set_count: 1,
                        workout_count: 1,
                        body_parts: [
                          { body_part: "chest", volume: 100, set_count: 1, workout_count: 1 },
                        ],
                      },
                    ]
                  : [],
            },
          },
    );
  });
  await navigate(page, "履歴");
  await page.getByRole("tab", { name: "使った部位", exact: true }).click();
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("alert")).toContainText("活動を取得できません");
  await expect(panel.getByText("最近の記録はありません", { exact: true })).toHaveCount(0);
  fail = false;
  await panel.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.locator(".personal-history-body-tags")).toContainText("胸");
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("月初の人体図は前月の保留・失敗を空と区別し、前月だけ再試行する", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-01T03:00:00Z"));
  await mockTraining(page, true, false, false);
  let previousReads = 0;
  let currentReads = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/workouts/activity?*", async (route) => {
    const month = new URL(route.request().url()).searchParams.get("month");
    if (month === "2026-09") {
      previousReads++;
      if (previousReads === 1) {
        await gate;
        return route.fulfill({ status: 503, json: { detail: "前月を取得できません" } });
      }
    } else currentReads++;
    await route.fulfill({
      json: {
        month,
        metric: "volume",
        total_volume: 100,
        total_sets: 1,
        workout_count: 1,
        active_days: 1,
        days:
          month === "2026-09"
            ? [
                {
                  date: "2026-09-30",
                  volume: 100,
                  set_count: 1,
                  workout_count: 1,
                  body_parts: [{ body_part: "back", volume: 100, set_count: 1, workout_count: 1 }],
                },
              ]
            : [],
      },
    });
  });
  await navigate(page, "履歴");
  await page.getByRole("tab", { name: "使った部位", exact: true }).click();
  await expect.poll(() => previousReads).toBe(1);
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByText("最近の記録はありません", { exact: true })).toHaveCount(0);
  release();
  await expect(panel.getByRole("alert")).toContainText("前月を取得できません");
  await expect(panel.getByText("最近の記録はありません", { exact: true })).toHaveCount(0);
  const before = currentReads;
  await panel.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.locator(".personal-history-body-tags")).toContainText("背中");
  expect(currentReads).toBe(before);
  expect(previousReads).toBe(2);
});

test("人体図は更新失敗でも表示済み部位を保持し、正常な空応答だけ記録なしを示す", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-28T03:00:00Z"));
  await mockTraining(page, true, false, false);
  let fail = false;
  let empty = false;
  await page.route("**/api/workouts/activity?*", (route) =>
    route.fulfill(
      fail
        ? { status: 503, json: { detail: "活動を取得できません" } }
        : {
            json: {
              month: "2026-09",
              metric: "volume",
              total_volume: empty ? 0 : 100,
              total_sets: empty ? 0 : 1,
              workout_count: empty ? 0 : 1,
              active_days: empty ? 0 : 1,
              days: empty
                ? []
                : [
                    {
                      date: "2026-09-28",
                      volume: 100,
                      set_count: 1,
                      workout_count: 1,
                      body_parts: [
                        { body_part: "chest", volume: 100, set_count: 1, workout_count: 1 },
                      ],
                    },
                  ],
            },
          },
    ),
  );
  await navigate(page, "履歴");
  await page.getByRole("tab", { name: "使った部位", exact: true }).click();
  await expect(page.locator(".personal-history-body-tags")).toContainText("胸");
  fail = true;
  await navigate(page, "ホーム");
  await navigate(page, "履歴");
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("alert")).toContainText("前回の内容を表示しています");
  await expect(page.locator(".personal-history-body-tags")).toContainText("胸");
  fail = false;
  empty = true;
  await panel.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(panel.getByText("最近の記録はありません", { exact: true })).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveCount(0);
});
