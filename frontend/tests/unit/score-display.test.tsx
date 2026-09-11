import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ScoreBadge, ScoreBreakdown } from "../../src/features/score/score-display";
import type { ScoreSummary } from "../../src/lib/api";

const score: ScoreSummary = {
  workout_id: "one",
  revision: 3,
  total: null,
  components: { c: null, i: 100, v: 94.7368, g: null },
  status: "pending",
  weights: { c: 30, i: 20, v: 40, g: 10 },
  weights_version: 0,
  scored_at: "2026-09-12",
};

test("未評価を0点や仮の総合点に見せず、内訳を表示する", () => {
  const html = renderToStaticMarkup(
    <>
      <ScoreBadge score={score} />
      <ScoreBreakdown score={score} />
    </>,
  );
  expect(html).toContain("計測中");
  expect(html).toContain("採点待ち");
  expect(html).toContain("95<small>点");
  expect(html).not.toContain("<strong>0<small>点");
});
test("確定総合点・未導入の記録・訂正後の状態を区別する", () => {
  expect(
    renderToStaticMarkup(<ScoreBadge score={{ ...score, total: 88, status: "complete" }} />),
  ).toContain("88点");
  expect(renderToStaticMarkup(<ScoreBadge />)).toBe("");
  expect(
    renderToStaticMarkup(<ScoreBadge score={{ ...score, total: 88, status: "stale" }} />),
  ).toContain("記録変更あり");
});

test("得点色は青から緑・暖色を通って赤へ連続し、未評価は灰色で0点と区別する", async () => {
  const { scoreAppearance, scoreGradient } = await import("../../src/features/score/score-colors");
  const background = (value: number | null) =>
    scoreAppearance(value)["--score-bg" as keyof ReturnType<typeof scoreAppearance>];
  expect(background(null)).toBe("rgb(232, 233, 237)");
  expect(background(0)).toBe("rgb(36, 106, 211)");
  expect(background(100)).toBe("rgb(217, 35, 46)");
  expect(background(74)).not.toBe(background(75));
  expect(scoreGradient).toContain("rgb(87, 173, 131)");
  for (let score = 0; score <= 100; score++) {
    const channels = String(background(score)).match(/\d+/g)?.map(Number) ?? [];
    // 紫の主成分である赤・青が同時に緑を大きく上回る色を入れない。
    expect(channels[0] > channels[1] + 30 && channels[2] > channels[1] + 30).toBe(false);
  }
});
