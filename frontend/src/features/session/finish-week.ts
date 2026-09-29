import type { Exercise, TrainingSession, Workout } from "@/lib/api";
import { addDays } from "../analytics/period";

export type FinishWeekDay = {
  date: string;
  volume: number;
  workoutCount: number;
};

export function sessionTotals(exercises: Exercise[]) {
  return exercises.reduce(
    (total, exercise) => {
      if (exercise.sets.length === 0) return total;
      total.exercises++;
      total.sets += exercise.sets.length;
      const volumeTenths = exercise.sets.reduce(
        (sum, set) => sum + Math.round(set.weight * 10) * set.reps,
        0,
      );
      total.volume = (Math.round(total.volume * 10) + volumeTenths) / 10;
      return total;
    },
    { volume: 0, sets: 0, exercises: 0 },
  );
}

export function finishWeekDays(
  lastDate: string,
  records: Workout[],
  current: TrainingSession,
): FinishWeekDay[] {
  const firstDate = addDays(lastDate, -6);
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: addDays(firstDate, index),
    volume: 0,
    workoutCount: 0,
  }));
  const byDate = new Map(days.map((day) => [day.date, day]));
  const seen = new Set<string>();
  // 取得済みの同一セッションを除き、端末上で見えている最新の今回セットを一度だけ加える。
  for (const record of [...records.filter((item) => item.id !== current.id), current]) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    const day = byDate.get(record.performed_on);
    if (!day) continue;
    const totals = sessionTotals(record.exercises);
    if (totals.sets === 0) continue;
    day.volume = (Math.round(day.volume * 10) + Math.round(totals.volume * 10)) / 10;
    day.workoutCount++;
  }
  return days;
}
