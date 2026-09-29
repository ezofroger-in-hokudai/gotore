import type { BodyPart, HistorySummary } from "@/lib/api";
import type { RecordSnapshot } from "@/lib/record-snapshot";

export function personalHistorySummary(snapshot: RecordSnapshot): HistorySummary {
  const parts = new Map(snapshot.options.map((option) => [option.name, option.primary_body_part]));
  const latest = new Map<string, string>();
  let workoutCount = 0;
  let totalSets = 0;
  let totalVolume = 0;
  let firstPerformedOn: string | null = null;
  for (const record of snapshot.workouts) {
    let hasSets = false;
    for (const exercise of record.exercises) {
      if (!exercise.sets.length) continue;
      hasSets = true;
      totalSets += exercise.sets.length;
      for (const set of exercise.sets) totalVolume += set.weight * set.reps;
      if ((latest.get(exercise.name) ?? "") < record.performed_on)
        latest.set(exercise.name, record.performed_on);
    }
    if (hasSets) {
      workoutCount++;
      if (firstPerformedOn === null || record.performed_on < firstPerformedOn)
        firstPerformedOn = record.performed_on;
    }
  }
  const exercises = [...latest]
    .sort(
      ([nameA, dateA], [nameB, dateB]) => dateB.localeCompare(dateA) || nameA.localeCompare(nameB),
    )
    .map(([name, last_performed_on]) => {
      const part = parts.get(name);
      return {
        name,
        body_part: (part && part !== "full_body" ? part : "other") as BodyPart,
        last_performed_on,
      };
    });
  return {
    workout_count: workoutCount,
    total_sets: totalSets,
    total_volume: totalVolume,
    first_performed_on: firstPerformedOn,
    exercises,
  };
}
