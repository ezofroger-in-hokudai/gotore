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
