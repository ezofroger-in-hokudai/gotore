import { expect, test } from "bun:test";
import { cachedRecordResource } from "../../src/features/record-cache/cached-resource";
import type { RecordChanges, RecordSnapshot } from "../../src/lib/record-snapshot";
import { applyRecordChanges, recordManifest, validSnapshot } from "../../src/lib/record-snapshot";

const snapshot: RecordSnapshot = {
  version: 1,
  user_id: "owner",
  workouts: [
    {
      id: "old",
      user_id: "owner",
      display_name: "本人",
      group_id: null,
      performed_on: "2026-01-01",
      created_at: "2026-01-01T00:00:00Z",
      revision: 1,
      exercises: [{ name: "ベンチプレス", sets: [{ weight: 60, reps: 8 }] }],
      best_sets: [{ exercise_index: 0, set_index: 0, weight: true, rm: true }],
      shared_group_ids: [],
    },
  ],
  options: [{ id: "option", name: "ベンチプレス", revision: 1 }],
  contexts: {
    ベンチプレス: {
      best_weight: 60,
      best_rm: 76,
      previous: { id: "old", performed_on: "2026-01-01", sets: [{ weight: 60, reps: 8 }] },
      memo: { content: "前", revision: 1 },
    },
  },
  workout_memos: { old: { content: "削除", revision: 1 } },
  session_exercise_memos: { old: { ベンチプレス: { content: "削除", revision: 1 } } },
};

test("保存済みの版だけを送り、変更がなければ端末記録を作り直さない", () => {
  const manifest = recordManifest(snapshot);
  expect(manifest.workouts[0]).toEqual({
    id: "old",
    revision: 1,
    names: ["ベンチプレス"],
    shared_group_ids: [],
    has_best: true,
  });
  expect(manifest.workout_memos).toEqual({ old: 1 });
  expect(applyRecordChanges(snapshot, emptyChanges())).toBe(snapshot);
});

test("差分の追加と削除を端末の履歴・前回値・メモへまとめて反映する", () => {
  const changes = emptyChanges();
  changes.deleted_workout_ids = ["old"];
  changes.workouts = [
    {
      ...snapshot.workouts[0],
      id: "new",
      performed_on: "2026-02-01",
      revision: 1,
    },
  ];
  changes.contexts = {
    ベンチプレス: {
      ...snapshot.contexts.ベンチプレス,
      previous: { id: "new", performed_on: "2026-02-01", sets: [{ weight: 70, reps: 8 }] },
    },
  };
  const next = applyRecordChanges(snapshot, changes);
  expect(next.workouts.map((row) => row.id)).toEqual(["new"]);
  expect(next.contexts.ベンチプレス.previous?.sets[0].weight).toBe(70);
  expect(next.workout_memos.old).toBeUndefined();
  expect(next.session_exercise_memos.old).toBeUndefined();
});

test("壊れた端末記録は履歴表示と差分送信に使わない", () => {
  expect(
    validSnapshot(
      { ...snapshot, workouts: [{ ...snapshot.workouts[0], exercises: [null] }] },
      "owner",
    ),
  ).toBe(false);
  expect(
    validSnapshot(
      {
        ...snapshot,
        contexts: { ベンチプレス: { ...snapshot.contexts.ベンチプレス, memo: { content: "前" } } },
      },
      "owner",
    ),
  ).toBe(false);
  expect(validSnapshot({ ...snapshot, workout_memos: { old: null } }, "owner")).toBe(false);
});

test("端末の記録は本人の履歴条件だけに使い、グループの読み出しには渡さない", () => {
  expect(cachedRecordResource(snapshot, "/workouts?offset=0&limit=50")).toEqual(snapshot.workouts);
  expect(cachedRecordResource(snapshot, "/workouts?exercise=別の種目")).toEqual([]);
  expect(cachedRecordResource(snapshot, "/groups/group-id/workouts?offset=0")).toBeNull();
  expect(
    cachedRecordResource(snapshot, "/groups/group-id/workouts/activity?month=2026-01"),
  ).toBeNull();
  expect(cachedRecordResource(snapshot, "/workouts?member_id=other-user")).toBeNull();
});

test("本人履歴の通算値と種目一覧を保存済みセットから先に表示する", () => {
  expect(cachedRecordResource(snapshot, "/history/summary")).toEqual({
    workout_count: 1,
    total_sets: 1,
    total_volume: 480,
    first_performed_on: "2026-01-01",
    exercises: [{ name: "ベンチプレス", body_part: "other", last_performed_on: "2026-01-01" }],
  });
});

test("本人の月間カレンダーを保存済みセットから先に表示する", () => {
  expect(cachedRecordResource(snapshot, "/workouts/activity?month=2026-01")).toEqual({
    month: "2026-01",
    metric: "volume",
    total_volume: 480,
    total_sets: 1,
    workout_count: 1,
    active_days: 1,
    days: [
      {
        date: "2026-01-01",
        volume: 480,
        set_count: 1,
        workout_count: 1,
        body_parts: [{ body_part: "other", volume: 480, set_count: 1, workout_count: 1 }],
        workout_groups: [{ body_parts: ["other"], workout_count: 1 }],
      },
    ],
  });
});

test("複数部位の同じ記録を日別件数で重複計上しない", () => {
  const mixed: RecordSnapshot = {
    ...snapshot,
    options: [
      { ...snapshot.options[0], primary_body_part: "chest" },
      { id: "squat", name: "スクワット", primary_body_part: "legs" },
    ],
    workouts: [
      {
        ...snapshot.workouts[0],
        exercises: [
          ...snapshot.workouts[0].exercises,
          { name: "スクワット", sets: [{ weight: 100, reps: 5 }] },
        ],
      },
    ],
  };
  const activity = cachedRecordResource(mixed, "/workouts/activity?month=2026-01") as {
    workout_count: number;
    days: { workout_count: number; body_parts: { workout_count: number }[] }[];
  };
  expect(activity.workout_count).toBe(1);
  expect(activity.days[0].workout_count).toBe(1);
  expect(activity.days[0].body_parts.map((part) => part.workout_count)).toEqual([1, 1]);
  const filtered = cachedRecordResource(
    mixed,
    "/workouts/activity?month=2026-01&exercise=スクワット",
  ) as { total_volume: number; workout_count: number };
  expect(filtered).toMatchObject({ total_volume: 500, workout_count: 1 });
});

function emptyChanges(): RecordChanges {
  return {
    version: 1,
    user_id: "owner",
    workouts: [],
    deleted_workout_ids: [],
    options: [],
    deleted_option_ids: [],
    contexts: {},
    deleted_context_names: [],
    workout_memos: {},
    deleted_workout_memo_ids: [],
    session_exercise_memos: {},
    deleted_session_exercise_memos: {},
  };
}
