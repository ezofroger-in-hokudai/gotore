import { expect, test } from "bun:test";
import {
  activityForPart,
  activityForParts,
  orderedParts,
  toggleActivityPart,
} from "../../src/features/activity/body-parts";
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
      body_parts: [{ body_part: "other", volume: 0, set_count: 1, workout_count: 1 }],
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

test("その他0kgは活動日として保ち、該当なしと区別する", () => {
  expect(activityForPart(data, "other").active_days).toBe(1);
  expect(activityForPart(data, "other").total_volume).toBe(0);
  expect(activityForPart(data, "back").days).toEqual([]);
  expect(
    activityForPart({ ...data, days: [{ ...data.days[0], body_parts: undefined }] }, "arms").days,
  ).toEqual([]);
});

test("部位名は現在の分類順に並び、その他を末尾にする", () => {
  expect(
    orderedParts([data.days[1].body_parts[0], ...data.days[0].body_parts]).map((x) => x.label),
  ).toEqual(["胸", "腕", "その他"]);
  expect(data.days[0].body_parts[0].body_part).toBe("arms");
});

test("胸と肩を合算し、同じ記録と活動日は一度だけ数える", () => {
  const mixed: MonthlyActivity = {
    ...data,
    days: [
      {
        ...data.days[0],
        volume: 900,
        set_count: 6,
        workout_count: 4,
        body_parts: [
          { body_part: "chest", volume: 400, set_count: 2, workout_count: 2 },
          { body_part: "shoulders", volume: 300, set_count: 2, workout_count: 2 },
          { body_part: "legs", volume: 200, set_count: 2, workout_count: 1 },
        ],
        workout_groups: [
          { body_parts: ["chest", "shoulders"], workout_count: 1 },
          { body_parts: ["chest"], workout_count: 1 },
          { body_parts: ["shoulders"], workout_count: 1 },
          { body_parts: ["legs"], workout_count: 1 },
        ],
      },
    ],
  };
  const value = activityForParts(mixed, ["chest", "shoulders", "chest"]);
  expect(value.total_volume).toBe(700);
  expect(value.total_sets).toBe(4);
  expect(value.workout_count).toBe(3);
  expect(value.active_days).toBe(1);
  expect(value.days[0].body_parts).toHaveLength(2);
  expect(mixed.days[0].body_parts).toHaveLength(3);
  expect(activityForParts(mixed, [])).toBe(mixed);
});

test("旧応答でも複数部位の負荷を合算し、不明な件数を推測しない", () => {
  const legacy: MonthlyActivity = {
    ...data,
    days: [
      {
        ...data.days[0],
        workout_count: 3,
        body_parts: [
          ...data.days[0].body_parts,
          { body_part: "legs", volume: 200, set_count: 1, workout_count: 1 },
        ],
      },
    ],
  };
  expect(activityForParts(legacy, ["chest", "arms"]).workout_count).toBeNull();
  expect(activityForParts(legacy, ["chest", "arms"]).total_volume).toBe(500);
  expect(activityForParts(legacy, ["chest", "arms", "legs"]).workout_count).toBe(3);
  expect(activityForParts(data, ["other", "back"]).active_days).toBe(1);
  expect(activityForParts(data, ["other", "back"]).total_volume).toBe(0);
  expect(activityForParts(data, ["back", "legs"]).workout_count).toBe(0);
});

test("部位の追加・解除・すべてと最後の解除を扱う", () => {
  expect(toggleActivityPart([], "chest")).toEqual(["chest"]);
  expect(toggleActivityPart(["chest"], "shoulders")).toEqual(["chest", "shoulders"]);
  expect(toggleActivityPart(["chest", "shoulders"], "chest")).toEqual(["shoulders"]);
  expect(toggleActivityPart(["shoulders"], "shoulders")).toEqual([]);
  expect(toggleActivityPart(["chest", "shoulders"], "all")).toEqual([]);
});
