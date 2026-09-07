import assert from "node:assert/strict";
import { test } from "node:test";
import { newDraft, readDraft, workoutPayload } from "../../src/features/training/draft";

test("下書きは復元でき、不正な保存データは無視する", () => {
  const draft = newDraft();
  assert.deepEqual(readDraft(JSON.stringify(draft)), draft);
  for (const value of [null, "broken", "{}", "null", '{"exercises":[]}'])
    assert.equal(readDraft(value), null);
});

test("空の数値を0として保存せず、入力を要求する", () => {
  const draft = newDraft();
  draft.exercises[0].name = "懸垂";
  draft.exercises[0].sets[0].reps = "10";
  assert.throws(() => workoutPayload(draft));
  draft.exercises[0].sets[0].weight = "0";
  assert.equal(workoutPayload(draft).exercises[0].sets[0].weight, 0);
});

test("送信IDと共有先を保持し、重量と回数の制約を検証する", () => {
  const draft = newDraft("group-id");
  draft.exercises[0].name = " ベンチプレス ";
  const set = draft.exercises[0].sets[0];
  set.weight = "82.5";
  set.reps = "8";
  const payload = workoutPayload(draft);
  assert.equal(payload.id, draft.id);
  assert.equal(payload.group_id, "group-id");
  assert.equal(payload.exercises[0].name, "ベンチプレス");
  for (const [weight, reps] of [
    ["0.01", "8"],
    ["-1", "8"],
    ["80", "0"],
    ["80", "1.5"],
  ]) {
    set.weight = weight;
    set.reps = reps;
    assert.throws(() => workoutPayload(draft));
  }
});

test("再利用は新規IDと今日の日付・非共有の下書きにし、元の実績を変更しない", async () => {
  const { reuseDraft, today } = await import("../../src/features/training/draft");
  const record = {
    id: "old",
    user_id: "user",
    display_name: "本人",
    group_id: "old-group",
    performed_on: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    exercises: [
      {
        name: "スクワット",
        sets: [
          { weight: 80.5, reps: 8 },
          { weight: 0, reps: 10 },
        ],
      },
    ],
  };
  const first = reuseDraft(record);
  const second = reuseDraft(record);
  assert.notEqual(first.id, record.id);
  assert.notEqual(first.id, second.id);
  assert.equal(first.performed_on, today());
  assert.equal(first.group_id, "");
  assert.notEqual(first.exercises[0].key, second.exercises[0].key);
  assert.notEqual(first.exercises[0].sets[0].key, first.exercises[0].sets[1].key);
  assert.deepEqual(workoutPayload(first).exercises, record.exercises);
  first.exercises[0].sets[0].weight = "90";
  assert.equal(record.exercises[0].sets[0].weight, 80.5);
});
