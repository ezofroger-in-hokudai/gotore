import type { Workout } from "@/lib/api";

export function recordSummary(record: Workout) {
  let sets = 0;
  let volume = 0;
  for (const exercise of record.exercises) {
    sets += exercise.sets.length;
    for (const set of exercise.sets) volume += set.weight * set.reps;
  }
  const elapsed =
    record.started_at && record.ended_at
      ? Date.parse(record.ended_at) - Date.parse(record.started_at)
      : null;
  return {
    sets,
    volume,
    minutes:
      elapsed !== null && Number.isFinite(elapsed)
        ? Math.max(0, Math.floor(elapsed / 60000))
        : null,
  };
}
