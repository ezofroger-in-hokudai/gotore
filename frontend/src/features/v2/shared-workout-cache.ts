import type { GroupActivity, Workout } from "@/lib/api";

export function sharedWorkoutVersion(item: GroupActivity["feed"][number]) {
  return JSON.stringify([item.updated_at, item.best, item.best_weight, item.best_rm]);
}

type Entry = { record: Workout; version: string; savedAt: number };

// Workspace ごとのメモリだけに保持し、別の利用者やログインへ持ち越さない。
export class SharedWorkoutCache {
  private readonly entries = new Map<string, Entry>();

  private key(groupId: string, workoutId: string) {
    return `${groupId}:${workoutId}`;
  }

  get(groupId: string, item: GroupActivity["feed"][number]) {
    const key = this.key(groupId, item.workout_id);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (
      entry.record.user_id !== item.user_id ||
      entry.version !== sharedWorkoutVersion(item) ||
      Date.now() - entry.savedAt >= 60_000
    ) {
      this.entries.delete(key);
      return null;
    }
    return entry.record;
  }

  put(groupId: string, item: GroupActivity["feed"][number], record: Workout) {
    if (record.id !== item.workout_id || record.user_id !== item.user_id) return;
    const key = this.key(groupId, item.workout_id);
    this.entries.delete(key);
    this.entries.set(key, { record, version: sharedWorkoutVersion(item), savedAt: Date.now() });
    while (this.entries.size > 20) this.entries.delete(this.entries.keys().next().value as string);
  }

  delete(groupId: string, workoutId: string) {
    this.entries.delete(this.key(groupId, workoutId));
  }

  retainGroups(groupIds: ReadonlySet<string>) {
    for (const key of this.entries.keys()) {
      const groupId = key.split(":", 1)[0];
      if (!groupIds.has(groupId)) this.entries.delete(key);
    }
  }

  clear() {
    this.entries.clear();
  }
}
