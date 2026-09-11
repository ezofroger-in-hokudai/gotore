import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalyticsChart } from "../../src/features/analytics/chart";
import type { Point } from "../../src/features/analytics/types";

function point(day: number, weight: number | null): Point {
  return {
    start: `2026-09-${String(day).padStart(2, "0")}`,
    end: `2026-09-${String(day).padStart(2, "0")}`,
    weight,
    rm: weight,
    volume: weight === null ? 0 : weight * 10,
    sets: weight === null ? 0 : 1,
    days: weight === null ? 0 : 1,
    people: weight === null ? 0 : 1,
  };
}

test("重量とRMは欠測をまたいで実測点をつなぎ、欠測点や数値を生成しない", () => {
  const points = [point(1, null), point(2, 60), point(3, null), point(4, 80), point(5, null)];
  for (const metric of ["weight", "rm"] as const) {
    const html = renderToStaticMarkup(<AnalyticsChart points={points} metric={metric} />);
    expect(html.match(/class="chart-line"/g)?.length).toBe(1);
    expect(html.match(/class="chart-dot"/g)?.length).toBe(2);
    expect(html).toContain("実際の記録点を線でつないでいます");
  }
  expect(points.map((p) => p.weight)).toEqual([null, 60, null, 80, null]);
});

test("総負荷とセット数は未記録日の0を残し、重量の実測が1点なら補間点を作らない", () => {
  const points = [point(1, 60), point(2, null), point(3, 80)];
  for (const metric of ["volume", "sets"] as const) {
    const html = renderToStaticMarkup(<AnalyticsChart points={points} metric={metric} />);
    expect(html.match(/class="chart-dot"/g)?.length).toBe(3);
  }
  const html = renderToStaticMarkup(
    <AnalyticsChart points={[point(1, null), point(2, 60), point(3, null)]} metric="weight" />,
  );
  expect(html.match(/class="chart-dot"/g)?.length).toBe(1);
  expect(html).not.toContain(" L");
});
