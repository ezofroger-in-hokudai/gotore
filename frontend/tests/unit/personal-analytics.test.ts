import { expect, test } from "bun:test";
import { cachedRecordResource } from "../../src/features/record-cache/cached-resource";
import { personalAnalytics } from "../../src/features/record-cache/personal-analytics";
import type { RecordSnapshot } from "../../src/lib/record-snapshot";

const snapshot: RecordSnapshot = {
  version: 1,
  user_id: "owner",
  workouts: [
    {
      id: "one",
      user_id: "owner",
      display_name: "本人",
      group_id: null,
      performed_on: "2026-09-06",
      created_at: "2026-09-06T01:00:00Z",
      revision: 1,
      exercises: [
        {
          name: "ベンチ",
          sets: [
            { weight: 60, reps: 8 },
            { weight: 0, reps: 10 },
          ],
        },
        { name: "スクワット", sets: [{ weight: 100, reps: 11 }] },
      ],
    },
    {
      id: "two",
      user_id: "owner",
      display_name: "本人",
      group_id: null,
      performed_on: "2026-09-07",
      created_at: "2026-09-07T01:00:00Z",
      revision: 1,
      exercises: [
        { name: "ベンチ", sets: [{ weight: 62.5, reps: 1 }] },
        { name: "未記録", sets: [] },
      ],
    },
  ],
  options: [
    { id: "bench", name: "ベンチ", primary_body_part: "chest" },
    { id: "squat", name: "スクワット", primary_body_part: "legs" },
  ],
  contexts: {},
  workout_memos: {},
  session_exercise_memos: {},
};

test("個人グラフを全端末記録から集計し、週境界・欠測RM・部位を守る", () => {
  const all = personalAnalytics(snapshot, "2026-09-10", null, null);
  expect(all.totals).toMatchObject({
    sets: 4,
    volume: 1642.5,
    days: 2,
    people: 1,
    weight: 100,
    weight_exercise: "スクワット",
    rm: 76,
    rm_exercise: "ベンチ",
  });
  expect(all.exercises).toEqual(["スクワット", "ベンチ"]);
  expect(all.series.week?.map(({ start, end, volume }) => ({ start, end, volume }))).toEqual([
    { start: "2026-09-06", end: "2026-09-06", volume: 1580 },
    { start: "2026-09-07", end: "2026-09-10", volume: 62.5 },
  ]);
  expect(personalAnalytics(snapshot, "2026-09-10", null, "chest").totals).toMatchObject({
    volume: 542.5,
    weight: 62.5,
    rm: 76,
  });
  expect(personalAnalytics(snapshot, "2026-09-10", "スクワット", null).totals.rm).toBeNull();
});

test("端末の個人グラフだけを共通読み出しへ渡す", () => {
  expect(cachedRecordResource(snapshot, "/analytics?period=all&offset=0")).toMatchObject({
    totals: { volume: 1642.5 },
  });
  expect(cachedRecordResource(snapshot, "/groups/group/analytics?period=all&offset=0")).toBeNull();
  expect(cachedRecordResource(snapshot, "/analytics?period=month&offset=0")).toBeNull();
});

test("0kgの記録と未記録を区別し、空のグラフは今日の1点にする", () => {
  const zero: RecordSnapshot = {
    ...snapshot,
    workouts: [
      {
        ...snapshot.workouts[0],
        exercises: [{ name: "ベンチ", sets: [{ weight: 0, reps: 10 }] }],
      },
    ],
  };
  expect(personalAnalytics(zero, "2026-09-10", null, null).totals).toMatchObject({
    volume: 0,
    weight: 0,
    rm: null,
    days: 1,
  });
  const empty = personalAnalytics({ ...snapshot, workouts: [] }, "2026-09-10", null, null);
  expect(empty.totals).toMatchObject({ weight: null, rm: null, days: 0 });
  expect(empty.series.month).toHaveLength(1);
});
