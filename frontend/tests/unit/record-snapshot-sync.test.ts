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
  expect(cachedRecordResource(snapshot, "/workouts?member_id=other-user")).toBeNull();
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
