import { expect, test } from "bun:test";
import { activityForPart, orderedParts } from "../../src/features/activity/body-parts";
import type { MonthlyActivity } from "../../src/lib/api";

const data = {
  month: "2024-02",
  metric: "volume",
  total_volume: 500,
  total_sets: 4,
  workout_count: 2,
  active_days: 2,
  days: [
    {
      date: "2024-02-01",
      volume: 500,
      set_count: 3,
      workout_count: 1,
      body_parts: [
        { body_part: "arms", volume: 100, set_count: 1, workout_count: 1 },
        { body_part: "chest", volume: 400, set_count: 2, workout_count: 1 },
      ],
    },
    {
      date: "2024-02-02",
      volume: 0,
      set_count: 1,
      workout_count: 1,
      body_parts: [{ body_part: null, volume: 0, set_count: 1, workout_count: 1 }],
    },
  ],
} satisfies MonthlyActivity;

test("部位変更は元の月データを保持し、全体件数は部位数で増やさない", () => {
  expect(activityForPart(data, "all")).toBe(data);
  const chest = activityForPart(data, "chest");
  expect(chest.total_volume).toBe(400);
  expect(chest.total_sets).toBe(2);
  expect(chest.workout_count).toBe(1);
  expect(chest.active_days).toBe(1);
  expect(data.days[0].body_parts).toHaveLength(2);
  expect(activityForPart(data, "all").workout_count).toBe(2);
});

test("未分類0kgは活動日として保ち、該当なしと区別する", () => {
  expect(activityForPart(data, "unclassified").active_days).toBe(1);
  expect(activityForPart(data, "unclassified").total_volume).toBe(0);
  expect(activityForPart(data, "back").days).toEqual([]);
  expect(
    activityForPart({ ...data, days: [{ ...data.days[0], body_parts: undefined }] }, "arms").days,
  ).toEqual([]);
});

test("部位名は現在の分類順に並び、未分類を末尾にする", () => {
  expect(
    orderedParts([data.days[1].body_parts[0], ...data.days[0].body_parts]).map((x) => x.label),
  ).toEqual(["胸", "腕", "未分類"]);
  expect(data.days[0].body_parts[0].body_part).toBe("arms");
});
