import { expect, test } from "bun:test";
import { chartGrains, chartKind, chartMaximum } from "../../src/features/analytics/presentation";

test("活動日数は週/月だけで集計し、APIにない粒度を選ばない", () => {
  expect(chartGrains("days", ["day", "week", "month"])).toEqual(["week", "month"]);
  expect(chartGrains("days", ["month"])).toEqual(["month"]);
  expect(chartGrains("volume", ["day", "week", "month"])).toEqual(["day", "week", "month"]);
});
test("合計値は棒、最高重量とRMは折れ線で描く", () => {
  for (const metric of ["volume", "sets", "days", "people"] as const)
    expect(chartKind(metric)).toBe("bar");
  for (const metric of ["weight", "rm"] as const) expect(chartKind(metric)).toBe("line");
});
test("日数・セット数・人数の目盛りを整数にし、重量の小数は保持する", () => {
  for (const metric of ["sets", "days", "people"] as const) {
    expect(chartMaximum(metric, [0])).toBe(2);
    expect(chartMaximum(metric, [1])).toBe(2);
    expect(chartMaximum(metric, [3])).toBe(4);
  }
  expect(chartMaximum("weight", [62.5, null])).toBe(62.5);
});
