import { expect, test } from "@playwright/test";
import type { ScoreDetail, TrainingGoal } from "../../src/lib/api";
import { mockTraining, navigate, startTraining } from "./mock-training";

const goal: TrainingGoal = {
  id: "goal-one",
  version: 1,
  body: "背中を中心に鍛えたい",
  is_standard: false,
  created_at: "2026-08-01T00:00:00+09:00",
  criteria: [
    { text: "背中の種目を含める", observation_days: 1 },
    { text: "背中を中心に配分する", observation_days: 1 },
  ],
};
const pending: ScoreDetail = {
  workout_id: "workout",
  revision: 3,
  total: null,
  components: { c: 75, i: 100, v: 94.7368, g: null },
  status: "pending",
  weights: { c: 30, i: 20, v: 40, g: 10 },
  weights_version: 0,
  scored_at: "2026-09-12T00:00:00+09:00",
  goal,
  baseline: null,
  comment: null,
  judgments: [],
  formula_version: "score-v1",
  model: null,
};

test("AIを待たず終了結果を表示し、ホームへ移動しても採点する", async ({ page }) => {
  const state = await mockTraining(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  let result = pending;
  await page.route("**/api/me/goal", (route) => route.fulfill({ json: goal }));
  await page.route("**/api/workouts/*/score", (route) => route.fulfill({ json: result }));
  await page.route("**/api/workouts/*/score/evaluate", async (route) => {
    calls++;
    await gate;
    result = {
      ...result,
      status: "complete",
      total: 88,
      components: { ...result.components, g: 75 },
      comment: "今日も目標に向けて一歩進めました。",
    };
    if (state.finished[0]) state.finished[0].score = result;
    await route.fulfill({ json: result });
  });
  await page.route("**/api/sessions/*/finish", async (route) => {
    if (!state.session) throw new Error("セッションがありません");
    result = { ...pending, workout_id: state.session.id, revision: state.session.revision + 1 };
    const ended = {
      ...state.session,
      revision: result.revision,
      ended_at: new Date().toISOString(),
      score: result,
    };
    state.finished.push(ended);
    state.session = null;
    await route.fulfill({ json: ended });
  });
  await startTraining(page);
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  await page.getByRole("button", { name: "終了する", exact: true }).click();
  try {
    await expect(page.getByRole("heading", { name: "おつかれさまでした。" })).toBeVisible();
    await expect(page.locator(".result-score")).toContainText("計測中");
    await expect(page.getByRole("button", { name: "ホームへ", exact: true })).toBeEnabled();
    await expect.poll(() => calls).toBe(1);
    await page.screenshot({
      path: "test-results/score-pending.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "ホームへ", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible();
  } finally {
    release();
  }
  await navigate(page, "履歴");
  await expect(page.locator(".history-row .score-badge")).toContainText("88点");
  await page.locator(".history-row").click();
  await page.getByRole("button", { name: /のスコア詳細/ }).click();
  await expect(page.getByText("今日も目標に向けて一歩進めました。", { exact: true })).toBeVisible();
  expect(calls).toBe(1);
});

test("目標はAI提案を確認・修正して保存し、途中の提案では更新しない", async ({ page }) => {
  await mockTraining(page);
  let current = goal;
  let saves = 0;
  let fail = true;
  await page.route("**/api/me/goal", async (route) => {
    if (route.request().method() === "PUT") {
      saves++;
      current = { ...current, ...route.request().postDataJSON(), version: 2 };
    }
    await route.fulfill({ json: current });
  });
  await page.route("**/api/me/goal/proposal", (route) =>
    route.fulfill(
      fail
        ? { status: 503, json: { detail: "提案を取得できません" } }
        : { json: { criteria: goal.criteria, questions: [] } },
    ),
  );
  await navigate(page, "設定");
  await page.getByRole("button", { name: /^自分の目標/ }).click();
  await page
    .getByRole("textbox", { name: "自分の目標", exact: true })
    .fill("背中の種目を毎回入れる");
  await page.getByRole("button", { name: "AIに評価基準を提案してもらう" }).click();
  await expect(page.locator(".goal-panel").getByRole("alert")).toContainText(
    "提案を取得できません",
  );
  await expect(page.getByRole("textbox", { name: "自分の目標", exact: true })).toHaveValue(
    "背中の種目を毎回入れる",
  );
  fail = false;
  await page.getByRole("button", { name: "AIに評価基準を提案してもらう" }).click();
  await expect(page.getByRole("button", { name: "この目標で保存" })).toBeDisabled();
  expect(saves).toBe(0);
  await page
    .getByRole("textbox", { name: "条件 1", exact: true })
    .fill("背中の種目を少なくとも1つ含める");
  await expect(page.getByRole("combobox", { name: "確認する期間" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "この条件で評価することを確認しました" }).check();
  await page.screenshot({
    path: "test-results/score-goal-review.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "この目標で保存" }).click();
  await expect.poll(() => saves).toBe(1);
  expect(current.criteria[0].text).toBe("背中の種目を少なくとも1つ含める");
  await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
});

test("確定スコアと一言がスマートフォン幅で読めて、仲間の画面へ共有される", async ({ page }) => {
  const state = await mockTraining(page);
  const completed = {
    ...pending,
    status: "complete" as const,
    total: 88,
    components: { ...pending.components, g: 75 },
    comment: "今日も目標に向けて一歩進めました。",
  };
  await page.route("**/api/me/goal", (route) => route.fulfill({ json: goal }));
  await page.route("**/api/workouts/*/score", (route) => route.fulfill({ json: completed }));
  await page.route("**/api/workouts/*/score/evaluate", (route) =>
    route.fulfill({ json: completed }),
  );
  await page.route("**/api/sessions/*/finish", async (route) => {
    if (!state.session) throw new Error("セッションがありません");
    const ended = {
      ...state.session,
      revision: state.session.revision + 1,
      ended_at: new Date().toISOString(),
      score: completed,
    };
    state.finished.push(ended);
    state.session = null;
    await route.fulfill({ json: ended });
  });
  await startTraining(page);
  await page.getByRole("button", { name: "次のセットへ", exact: true }).click();
  await expect(page.locator(".sync-status")).toContainText("同期済み");
  await page.getByRole("button", { name: "トレーニング終了", exact: true }).click();
  await page.getByRole("button", { name: "終了する", exact: true }).click();
  await expect(page.locator(".result-score")).toContainText("88点");
  await expect(page.getByText(completed.comment, { exact: true })).toBeVisible();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect(page.getByRole("button", { name: "ホームへ", exact: true })).toBeInViewport();
    const historyButton = await page
      .getByRole("button", { name: "履歴を見る", exact: true })
      .boundingBox();
    const navigation = await page.getByRole("navigation").boundingBox();
    expect(
      historyButton && navigation && historyButton.y + historyButton.height <= navigation.y,
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/score-result-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "ホームへ", exact: true }).click();
  await expect(page.locator(".feed-item .score-badge")).toContainText("88点");
  const points = await page.locator(".feed-item .score-badge").boundingBox();
  const entry = await page.locator(".feed-item .feed-value").boundingBox();
  expect(points && entry && points.x > entry.x + entry.width).toBeTruthy();
  await expect(page.locator(".feed-item .score-badge")).toHaveAttribute("data-score", "88");
  await expect(page.getByText(goal.body, { exact: true })).toHaveCount(0);
  await expect(page.getByText(completed.comment, { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "test-results/score-home.png",
    fullPage: true,
    animations: "disabled",
  });
});
