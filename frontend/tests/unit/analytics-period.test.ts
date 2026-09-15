import { expect, test } from "bun:test";
import {
  frameEnd,
  framePoints,
  periodGrains,
  shiftAnchor,
} from "../../src/features/analytics/period";

test("週は日別7枠、長期は読み取れる粒度だけを表示する", () => {
  const all = ["day", "week", "month"] as const;
  expect(periodGrains("week", "volume", [...all])).toEqual(["day"]);
  expect(periodGrains("week", "days", [...all])).toEqual(["day"]);
  expect(periodGrains("month", "days", [...all])).toEqual(["week"]);
  expect(periodGrains("quarter", "sets", [...all])).toEqual(["week", "month"]);
  expect(periodGrains("year", "volume", [...all])).toEqual(["month"]);
  expect(frameEnd("2026-09-15", "week")).toBe("2026-09-20");
  const points = [14, 15].map((day) => ({
    start: `2026-09-${day}`,
    end: `2026-09-${day}`,
    volume: 0,
    sets: 0,
    days: 0,
    people: 0,
    weight: null,
    rm: null,
  }));
  const framed = framePoints(points, "week", "day", "2026-09-15");
  expect(framed.length).toBe(7);
  expect(framed.filter((p) => p.future).length).toBe(5);
  expect(framed[0].volume).toBe(0);
  expect(framed.at(-1)?.volume).toBeNull();
});
test("月末・閏年・年境界でも期間幅ぶん移動する", () => {
  expect(shiftAnchor("2024-03-31", "month", -1)).toBe("2024-02-01");
  expect(frameEnd("2024-02-15", "month")).toBe("2024-02-29");
  expect(shiftAnchor("2026-01-15", "quarter", -1)).toBe("2025-10-01");
  expect(shiftAnchor("2026-01-01", "week", -1)).toBe("2025-12-25");
});
