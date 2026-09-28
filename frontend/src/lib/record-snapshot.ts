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
        (context.previous === null ||
          (context.previous && Array.isArray(context.previous.sets))) &&
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
