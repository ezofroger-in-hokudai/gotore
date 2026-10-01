import { expect, test } from "bun:test";
import { SharedWorkoutCache } from "../../src/features/v2/shared-workout-cache";
import type { GroupActivity, Workout } from "../../src/lib/api";

const item: GroupActivity["feed"][number] = {
  workout_id: "record",
  user_id: "friend",
  display_name: "友達",
  exercise: "スクワット",
  weight: 100,
  reps: 5,
  estimated_rm: 116.7,
  updated_at: "2026-09-28T01:00:00Z",
  best: false,
};
const record: Workout = {
  id: "record",
  user_id: "friend",
  display_name: "友達",
  group_id: "group-a",
  performed_on: "2026-09-28",
  created_at: item.updated_at,
  revision: 1,
  exercises: [{ name: "スクワット", sets: [{ weight: 100, reps: 5 }] }],
};

test("共有詳細はグループ・版・所属が一致する間だけ再利用する", () => {
  const cache = new SharedWorkoutCache();
  cache.put("group-a", item, record);
  expect(cache.get("group-a", item)).toEqual(record);
  expect(cache.get("group-b", item)).toBeNull();
  expect(cache.get("group-a", { ...item, updated_at: "2026-09-28T01:00:01Z" })).toBeNull();
  cache.put("group-a", item, record);
  cache.retainGroups(new Set(["group-b"]));
  expect(cache.get("group-a", item)).toBeNull();
});

test("別人の本文や期限切れの共有詳細を再利用しない", () => {
  const cache = new SharedWorkoutCache();
  cache.put("group-a", item, { ...record, user_id: "another" });
  expect(cache.get("group-a", item)).toBeNull();
  const now = Date.now;
  try {
    Date.now = () => 100_000;
    cache.put("group-a", item, record);
    Date.now = () => 160_000;
    expect(cache.get("group-a", item)).toBeNull();
  } finally {
    Date.now = now;
  }
});

test("フィードの所有者が変わった本文は再利用しない", () => {
  const cache = new SharedWorkoutCache();
  cache.put("group-a", item, record);
  expect(cache.get("group-a", { ...item, user_id: "another" })).toBeNull();
});
