import type { ExerciseContext, ExerciseOption, Workout } from "./api";

export type SavedMemo = { content: string; revision: number };

export type RecordSnapshot = {
  version: 1;
  user_id: string;
  workouts: Workout[];
  options: ExerciseOption[];
  contexts: Record<string, ExerciseContext>;
  workout_memos: Record<string, SavedMemo>;
  session_exercise_memos: Record<string, Record<string, SavedMemo>>;
};

export type RecordChanges = {
  version: 1;
  user_id: string;
  workouts: Workout[];
  deleted_workout_ids: string[];
  options: ExerciseOption[];
  deleted_option_ids: string[];
  contexts: Record<string, ExerciseContext>;
  deleted_context_names: string[];
  workout_memos: Record<string, SavedMemo>;
  deleted_workout_memo_ids: string[];
  session_exercise_memos: Record<string, Record<string, SavedMemo>>;
  deleted_session_exercise_memos: Record<string, string[]>;
};

export function recordManifest(snapshot: RecordSnapshot) {
  return {
    version: 1,
    workouts: snapshot.workouts.map((record) => ({
      id: record.id,
      revision: record.revision,
      names: record.exercises.map((exercise) => exercise.name),
      shared_group_ids: record.shared_group_ids ?? [],
      has_best: !!record.best_sets?.length,
    })),
    options: snapshot.options.map((option) => ({
      id: option.id,
      name: option.name,
      revision: option.revision ?? 0,
    })),
    contexts: Object.fromEntries(
      Object.entries(snapshot.contexts).map(([name, value]) => [name, value.memo.revision]),
    ),
    workout_memos: Object.fromEntries(
      Object.entries(snapshot.workout_memos).map(([id, value]) => [id, value.revision]),
    ),
    session_exercise_memos: Object.fromEntries(
      Object.entries(snapshot.session_exercise_memos).map(([id, memos]) => [
        id,
        Object.fromEntries(Object.entries(memos).map(([name, value]) => [name, value.revision])),
      ]),
    ),
    active_workout_id:
      snapshot.workouts.find((record) => record.started_at && !record.ended_at)?.id ?? null,
  };
}

export function validChanges(value: unknown, userId: string): value is RecordChanges {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<RecordChanges>;
  return (
    data.version === 1 &&
    data.user_id === userId &&
    Array.isArray(data.workouts) &&
    data.workouts.every((record) => record.user_id === userId) &&
    Array.isArray(data.deleted_workout_ids) &&
    Array.isArray(data.options) &&
    Array.isArray(data.deleted_option_ids) &&
    !!data.contexts &&
    Array.isArray(data.deleted_context_names) &&
    !!data.workout_memos &&
    Array.isArray(data.deleted_workout_memo_ids) &&
    !!data.session_exercise_memos &&
    !!data.deleted_session_exercise_memos
  );
}

export function applyRecordChanges(
  snapshot: RecordSnapshot,
  changes: RecordChanges,
): RecordSnapshot {
  if (
    !changes.workouts.length &&
    !changes.deleted_workout_ids.length &&
    !changes.options.length &&
    !changes.deleted_option_ids.length &&
    !Object.keys(changes.contexts).length &&
    !changes.deleted_context_names.length &&
    !Object.keys(changes.workout_memos).length &&
    !changes.deleted_workout_memo_ids.length &&
    !Object.keys(changes.session_exercise_memos).length &&
    !Object.keys(changes.deleted_session_exercise_memos).length
  )
    return snapshot;
  const changedWorkouts = new Map(changes.workouts.map((record) => [record.id, record]));
  const deletedWorkouts = new Set(changes.deleted_workout_ids);
  const workouts = snapshot.workouts
    .filter((record) => !deletedWorkouts.has(record.id) && !changedWorkouts.has(record.id))
    .concat(changes.workouts)
    .sort(
      (a, b) =>
        b.performed_on.localeCompare(a.performed_on) ||
        b.created_at.localeCompare(a.created_at) ||
        a.id.localeCompare(b.id),
    );
  const changedOptions = new Map(changes.options.map((option) => [option.id, option]));
  const deletedOptions = new Set(changes.deleted_option_ids);
  const options = snapshot.options
    .filter((option) => !deletedOptions.has(option.id) && !changedOptions.has(option.id))
    .concat(changes.options);
  const contexts = { ...snapshot.contexts, ...changes.contexts };
  for (const name of changes.deleted_context_names) delete contexts[name];
  const workout_memos = { ...snapshot.workout_memos, ...changes.workout_memos };
  for (const id of [...changes.deleted_workout_memo_ids, ...changes.deleted_workout_ids]) {
    delete workout_memos[id];
  }
  const session_exercise_memos = { ...snapshot.session_exercise_memos };
  for (const [id, memos] of Object.entries(changes.session_exercise_memos)) {
    session_exercise_memos[id] = { ...session_exercise_memos[id], ...memos };
  }
  for (const [id, names] of Object.entries(changes.deleted_session_exercise_memos)) {
    const memos = { ...session_exercise_memos[id] };
    for (const name of names) delete memos[name];
    if (Object.keys(memos).length) session_exercise_memos[id] = memos;
    else delete session_exercise_memos[id];
  }
  for (const id of changes.deleted_workout_ids) delete session_exercise_memos[id];
  return { ...snapshot, workouts, options, contexts, workout_memos, session_exercise_memos };
}

const databaseName = "gotore-record-snapshot";
const storeName = "users";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export function validSnapshot(value: unknown, userId: string): value is RecordSnapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<RecordSnapshot>;
  return (
    data.version === 1 &&
    data.user_id === userId &&
    Array.isArray(data.workouts) &&
    data.workouts.every(
      (record) =>
        record &&
        record.user_id === userId &&
        typeof record.id === "string" &&
        typeof record.performed_on === "string" &&
        Array.isArray(record.exercises),
    ) &&
    Array.isArray(data.options) &&
    data.options.every((option) => option && typeof option.name === "string") &&
    !!data.contexts &&
    typeof data.contexts === "object" &&
    Object.values(data.contexts).every(
      (context) =>
        context &&
        typeof context === "object" &&
        (context.previous === null || (context.previous && Array.isArray(context.previous.sets))) &&
        context.memo &&
        typeof context.memo.content === "string",
    ) &&
    !!data.workout_memos &&
    typeof data.workout_memos === "object" &&
    !!data.session_exercise_memos &&
    typeof data.session_exercise_memos === "object"
  );
}

export async function readRecordSnapshot(userId: string): Promise<RecordSnapshot | null> {
  const value = await withStore<unknown>("readonly", (store) => store.get(userId));
  return validSnapshot(value, userId) ? value : null;
}

export async function saveRecordSnapshot(snapshot: RecordSnapshot): Promise<void> {
  if (!validSnapshot(snapshot, snapshot.user_id)) throw new Error("記録データを確認できません");
  await withStore("readwrite", (store) => store.put(snapshot, snapshot.user_id));
}

export async function clearRecordSnapshot(userId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(userId));
}
