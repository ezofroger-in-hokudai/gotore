import type { ActivityBodyPart, ActivityDay, BodyPart, MonthlyActivity } from "@/lib/api";
import type { RecordSnapshot } from "@/lib/record-snapshot";
import { normalizeBodyPart } from "../exercises/body-parts";

type Day = ActivityDay & {
  parts: Map<BodyPart, ActivityBodyPart>;
  groups: Map<string, number>;
};

export function personalMonthlyActivity(
  snapshot: RecordSnapshot,
  month: string,
  exerciseName: string | null,
): MonthlyActivity {
  const options = new Map(snapshot.options.map((option) => [option.name, option]));
  const byDay = new Map<string, Day>();
  for (const record of snapshot.workouts) {
    if (!record.performed_on.startsWith(`${month}-`)) continue;
    const entries = record.exercises.filter(
      (exercise) => exercise.sets.length && (!exerciseName || exercise.name === exerciseName),
    );
    if (!entries.length) continue;
    let day = byDay.get(record.performed_on);
    if (!day) {
      day = {
        date: record.performed_on,
        volume: 0,
        set_count: 0,
        workout_count: 0,
        parts: new Map(),
        groups: new Map(),
      };
      byDay.set(record.performed_on, day);
    }
    day.workout_count++;
    const recordParts = new Set<BodyPart>();
    for (const exercise of entries) {
      const part = normalizeBodyPart(options.get(exercise.name)?.primary_body_part);
      recordParts.add(part);
      let partTotal = day.parts.get(part);
      if (!partTotal) {
        partTotal = { body_part: part, volume: 0, set_count: 0, workout_count: 0 };
        day.parts.set(part, partTotal);
      }
      partTotal.set_count += exercise.sets.length;
      day.set_count += exercise.sets.length;
      for (const set of exercise.sets) {
        const volume = set.weight * set.reps;
        partTotal.volume += volume;
        day.volume += volume;
      }
    }
    for (const part of recordParts) {
      const total = day.parts.get(part);
      if (total) total.workout_count++;
    }
    const key = [...recordParts].sort().join(",");
    day.groups.set(key, (day.groups.get(key) ?? 0) + 1);
  }
  const days = [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ parts, groups, ...day }) => ({
      ...day,
      body_parts: [...parts.values()].sort((a, b) =>
        (a.body_part ?? "").localeCompare(b.body_part ?? ""),
      ),
      workout_groups: [...groups].map(([key, workout_count]) => ({
        body_parts: key.split(",") as BodyPart[],
        workout_count,
      })),
    }));
  return {
    month,
    metric: "volume",
    total_volume: days.reduce((total, day) => total + day.volume, 0),
    total_sets: days.reduce((total, day) => total + day.set_count, 0),
    workout_count: days.reduce((total, day) => total + day.workout_count, 0),
    active_days: days.length,
    days,
  };
}
