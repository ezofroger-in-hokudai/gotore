import type { Exercise, ExerciseContext } from "@/lib/api";

export function estimatedRM(weight: number, reps: number): number | null {
  if (weight <= 0 || reps < 1 || reps > 10) return null;
  return displayEstimatedRM(weight, reps);
}

// 記録中の目安表示は保存せず、その時点の入力値から毎回算出する。
// BEST判定は従来どおり1〜10回だけを対象にする。
export function displayEstimatedRM(weight: number, reps: number): number | null {
  if (weight <= 0 || reps < 1 || !Number.isFinite(weight) || !Number.isFinite(reps)) return null;
  return Math.round((reps === 1 ? weight : weight * (1 + reps / 30)) * 10 + 1e-8) / 10;
}

export function bestUpdate(weight: number, reps: number, context: ExerciseContext | null) {
  const rm = estimatedRM(weight, reps);
  return (
    !!context &&
    ((context.best_weight !== null && weight > context.best_weight) ||
      (context.best_rm !== null && rm !== null && rm > context.best_rm))
  );
}

export function setValue(weight: string, reps: string) {
  const w = Number(weight);
  const r = Number(reps);
  if (
    !weight.trim() ||
    !reps.trim() ||
    !Number.isFinite(w) ||
    w < 0 ||
    w > 1000 ||
    Math.abs(w * 10 - Math.round(w * 10)) > 1e-8 ||
    !Number.isInteger(r) ||
    r < 1 ||
    r > 1000
  ) {
    throw new Error("重量は0〜1000kg（小数1桁まで）、回数は1〜1000回で入力してください。");
  }
  return { weight: w, reps: r };
}

export function updateSet(
  exercises: Exercise[],
  name: string,
  value: Exercise["sets"][number],
  index: number | null,
) {
  const positions = exercises.flatMap((exercise, i) => (exercise.name === name ? [i] : []));
  if (!positions.length) {
    if (exercises.length >= 20) throw new Error("種目は20件までです。");
    return [...exercises, { name, sets: [value] }];
  }
  let target = positions.at(-1) as number;
  let localIndex = index;
  if (index !== null) {
    let remaining = index;
    target = -1;
    for (const position of positions) {
      if (remaining < exercises[position].sets.length) {
        target = position;
        localIndex = remaining;
        break;
      }
      remaining -= exercises[position].sets.length;
    }
    if (target < 0) throw new Error("セットが変更されています。読み直してください。");
  }
  return exercises.map((exercise, i) => {
    if (i !== target) return exercise;
    if (localIndex === null && exercise.sets.length >= 30)
      throw new Error("セットは30件までです。");
    return {
      ...exercise,
      sets:
        localIndex === null
          ? [...exercise.sets, value]
          : exercise.sets.map((s, j) => (j === localIndex ? value : s)),
    };
  });
}

export function appendSets(exercises: Exercise[], name: string, values: Exercise["sets"]) {
  if (!values.length) return exercises;
  const positions = exercises.flatMap((exercise, index) => (exercise.name === name ? [index] : []));
  if (!positions.length) {
    if (exercises.length >= 20) throw new Error("種目は20件までです。");
    if (values.length > 30) throw new Error("セットは30件までです。");
    return [...exercises, { name, sets: values }];
  }
  const target = positions.at(-1) as number;
  if (exercises[target].sets.length + values.length > 30) throw new Error("セットは30件までです。");
  return exercises.map((exercise, index) =>
    index === target ? { ...exercise, sets: [...exercise.sets, ...values] } : exercise,
  );
}

export function removeSet(exercises: Exercise[], name: string, index: number) {
  let remaining = index;
  return exercises.flatMap((exercise) => {
    if (exercise.name !== name) return [exercise];
    if (remaining >= exercise.sets.length) {
      remaining -= exercise.sets.length;
      return [exercise];
    }
    const sets = exercise.sets.filter((_, setIndex) => setIndex !== remaining);
    remaining = -1;
    return sets.length ? [{ ...exercise, sets }] : [];
  });
}

export type SessionInput = {
  name: string;
  weight: string;
  reps: string;
  editing: number | null;
  dirty: boolean;
  revision?: number;
  awaitingPrevious?: boolean;
};
export const emptyInput: SessionInput = {
  name: "",
  weight: "20",
  reps: "10",
  editing: null,
  dirty: false,
};
export function readSessionInput(raw: string | null): SessionInput {
  try {
    const value = JSON.parse(raw || "null");
    if (
      value &&
      typeof value.name === "string" &&
      value.name.length <= 60 &&
      typeof value.weight === "string" &&
      typeof value.reps === "string" &&
      (value.editing === null || (Number.isInteger(value.editing) && value.editing >= 0))
    ) {
      return {
        ...value,
        dirty: value.dirty === true,
        awaitingPrevious: value.awaitingPrevious === true,
      };
    }
  } catch {
    /* 壊れた端末内データはサーバーの記録に影響させない。 */
  }
  return { ...emptyInput };
}
