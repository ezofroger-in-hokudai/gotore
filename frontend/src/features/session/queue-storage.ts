import type { Exercise, TrainingSession } from "@/lib/api";

type Splice<T> = { start: number; remove: number; values: T[] };
type Change =
  | ({ kind: "sets"; exercise: number } & Splice<Exercise["sets"][number]>)
  | ({ kind: "exercises" } & Splice<Exercise>);
export type SavedQueue = {
  base: TrainingSession;
  pending: { id: string; change: Change }[];
  conflict?: boolean;
};

const invalid = () =>
  new Error("端末の保存待ちデータを読み取れません。データを削除せず確認してください。");
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function difference<T>(before: T[], after: T[]): Splice<T> {
  let start = 0;
  while (start < before.length && start < after.length && equal(before[start], after[start]))
    start++;
  let suffix = 0;
  while (
    suffix < before.length - start &&
    suffix < after.length - start &&
    equal(before[before.length - 1 - suffix], after[after.length - 1 - suffix])
  )
    suffix++;
  return {
    start,
    remove: before.length - start - suffix,
    values: structuredClone(after.slice(start, after.length - suffix)),
  };
}

export function queueChange(before: Exercise[], after: Exercise[]): Change {
  const change = difference(before, after);
  if (
    change.remove === 1 &&
    change.values.length === 1 &&
    before[change.start].name === after[change.start].name
  ) {
    return {
      kind: "sets",
      exercise: change.start,
      ...difference(before[change.start].sets, after[change.start].sets),
    };
  }
  return { kind: "exercises", ...change };
}

function replace<T>(before: T[], change: Splice<T>) {
  if (
    !Number.isInteger(change.start) ||
    !Number.isInteger(change.remove) ||
    change.start < 0 ||
    change.remove < 0 ||
    change.start + change.remove > before.length ||
    !Array.isArray(change.values)
  )
    throw invalid();
  return [
    ...before.slice(0, change.start),
    ...change.values,
    ...before.slice(change.start + change.remove),
  ];
}

export function applyQueueChange(before: Exercise[], change: Change): Exercise[] {
  if (change?.kind === "exercises") return replace(before, change);
  if (change?.kind !== "sets" || !Number.isInteger(change.exercise) || !before[change.exercise])
    throw invalid();
  const result = before.slice();
  result[change.exercise] = {
    ...before[change.exercise],
    sets: replace(before[change.exercise].sets, change),
  };
  return result;
}

export function queuedExercises(record: SavedQueue) {
  return record.pending.reduce(
    (exercises, job) => applyQueueChange(exercises, job.change),
    record.base.exercises,
  );
}

function validSets(value: unknown): value is Exercise["sets"] {
  return (
    Array.isArray(value) &&
    value.every(
      (set) =>
        set &&
        Number.isFinite(set.weight) &&
        set.weight >= 0 &&
        Number.isInteger(set.reps) &&
        set.reps > 0,
    )
  );
}

function validExercises(value: unknown): value is Exercise[] {
  return (
    Array.isArray(value) &&
    value.every(
      (exercise) =>
        typeof exercise?.name === "string" && exercise.name.length > 0 && validSets(exercise.sets),
    )
  );
}

export function readQueue(raw: string): SavedQueue {
  const value = JSON.parse(raw);
  if (
    (value?.version !== undefined && value.version !== 2) ||
    typeof value?.base?.id !== "string" ||
    !value.base.id ||
    !Number.isInteger(value.base.revision) ||
    value.base.revision < 1 ||
    !validExercises(value.base.exercises) ||
    !Array.isArray(value.pending) ||
    (value.conflict !== undefined && typeof value.conflict !== "boolean")
  )
    throw invalid();
  let exercises: Exercise[] = value.base.exercises;
  const ids = new Set<string>();
  const pending = value.pending.map((job: { id: string; change: Change; exercises: unknown }) => {
    if (typeof job?.id !== "string" || !job.id || ids.has(job.id)) throw invalid();
    ids.add(job.id);
    let change: Change;
    if (value.version === 2) {
      change = job.change;
      if (
        change?.kind === "sets"
          ? !validSets(change.values)
          : change?.kind !== "exercises" || !validExercises(change.values)
      )
        throw invalid();
      exercises = applyQueueChange(exercises, change);
    } else {
      if (!validExercises(job.exercises)) throw invalid();
      change = queueChange(exercises, job.exercises);
      exercises = job.exercises;
    }
    return { id: job.id, change };
  });
  return { base: value.base, pending, ...(value.conflict ? { conflict: true } : {}) };
}

export function writeQueue(record: SavedQueue) {
  // 操作ID・順序を残す。各操作の全状態は送信直前に復元し、間引かない。
  return JSON.stringify({ version: 2, ...record });
}
