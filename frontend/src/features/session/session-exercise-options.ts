import type { Exercise, ExerciseOption } from "../../lib/api";

export function sessionExerciseOptions(
  options: ExerciseOption[],
  exercises: Exercise[],
): ExerciseOption[] {
  const available = [...options];
  const names = new Set(options.map((option) => option.name));
  for (const exercise of exercises) {
    if (!exercise.sets.length || names.has(exercise.name)) continue;
    // リストから消しても今回の記録は残るため、入力へ戻る入口を維持する。
    available.push({
      id: `session:${exercise.name}`,
      name: exercise.name,
      primary_body_part: "other",
      secondary_body_parts: [],
    });
    names.add(exercise.name);
  }
  return available;
}
