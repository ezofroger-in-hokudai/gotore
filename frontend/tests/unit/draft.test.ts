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
