import { expect, test } from "bun:test";
import type { Analytics, Point } from "../../src/features/analytics/types";
import {
  graphPoints,
  recentExercises,
  recentPartAges,
  smoothGraphPath,
} from "../../src/features/v2/personal-history-model";
import type { HistorySummary } from "../../src/lib/api";

const summary: HistorySummary = {
  workout_count: 3,
  total_sets: 5,
  total_volume: 600,
  first_performed_on: "2026-09-01",
  exercises: [
    { name: "スクワット", body_part: "legs", last_performed_on: "2026-09-25" },
    { name: "ベンチプレス", body_part: "chest", last_performed_on: "2026-09-27" },
    { name: "チェストプレス", body_part: "chest", last_performed_on: "2026-09-26" },
  ],
};

const point = (start: string, volume: number, weight: number | null): Point => ({
  start,
  end: start,
  volume,
  weight,
  weight_exercise: weight === null ? null : "スクワット",
  rm: weight === null ? null : weight * 1.2,
  rm_exercise: weight === null ? null : "スクワット",
  sets: 1,
  days: 1,
  people: 1,
});

test("種目は最後に記録した順で、部位によって絞り込める", () => {
  expect(recentExercises(summary, "all").map((item) => item.name)).toEqual([
    "ベンチプレス",
    "チェストプレス",
    "スクワット",
  ]);
  expect(recentExercises(summary, "chest").map((item) => item.name)).toEqual([
    "ベンチプレス",
    "チェストプレス",
  ]);
});

test("月と全期間は同じ月別数値を使い、記録開始前を除く", () => {
  const series = Array.from({ length: 8 }, (_, index) =>
    point(
      `2026-${String(index + 1).padStart(2, "0")}-01`,
      100,
      index === 2 ? null : index === 7 ? 42 : 40 + index,
    ),
  );
  const data = { series: { month: series } } as Analytics;
  expect(graphPoints(data, "month").map((item) => item.start)).toEqual(
    series.map((item) => item.start),
  );
  expect(graphPoints(data, "all")).toEqual(graphPoints(data, "month"));
  expect(graphPoints(data, "all").at(-1)?.volume).toBe(100);
  expect(graphPoints(data, "all").at(-1)?.weight).toBe(42);
  expect(graphPoints(data, "all").at(-1)?.weight_exercise).toBe("スクワット");
  expect(graphPoints(data, "all", "2026-03-01")[0].weight).toBeNull();
  expect(graphPoints(data, "all", "2026-03-01")[0].start).toBe("2026-03-01");
  expect(graphPoints(data, "all").at(-1)?.sets).toBe(1);
  expect(graphPoints(data, "all").at(-1)?.people).toBe(1);
});

test("直近3日だけの主部位を最新日で色分けする", () => {
  const day = (date: string, body_part: "chest" | "legs") => ({
    date,
    volume: 100,
    set_count: 1,
    workout_count: 1,
    body_parts: [{ body_part, volume: 100, set_count: 1, workout_count: 1 }],
  });
  expect(
    recentPartAges(
      [day("2026-09-24", "legs"), day("2026-09-25", "chest"), day("2026-09-28", "chest")],
      "2026-09-28",
    ),
  ).toEqual({ chest: 0 });
});

test("滑らかな推移線は1点と空データでも有効", () => {
  expect(smoothGraphPath([])).toBe("");
  expect(smoothGraphPath([[1, 2]])).toBe("M1 2");
  expect(
    smoothGraphPath([
      [1, 2],
      [3, 4],
    ]),
  ).toContain("C");
});
