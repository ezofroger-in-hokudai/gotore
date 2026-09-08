import type { Workout } from "@/lib/api";

export type DraftSet = { key: string; weight: string; reps: string };
export type DraftExercise = { key: string; name: string; sets: DraftSet[] };
export type Draft = {
  id: string;
  performed_on: string;
  group_id: string;
  exercises: DraftExercise[];
};

export function today(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

export function newSet(): DraftSet {
  return { key: crypto.randomUUID(), weight: "", reps: "" };
}

export function newExercise(): DraftExercise {
  return { key: crypto.randomUUID(), name: "", sets: [newSet()] };
}

export function newDraft(groupId = ""): Draft {
  return {
    id: crypto.randomUUID(),
    performed_on: today(),
    group_id: groupId,
    exercises: [newExercise()],
  };
}

export function readDraft(value: string | null): Draft | null {
  if (!value) return null;
  try {
    const data = JSON.parse(value) as Draft;
    if (
      typeof data.id !== "string" ||
      typeof data.performed_on !== "string" ||
      typeof data.group_id !== "string" ||
      !Array.isArray(data.exercises) ||
      data.exercises.length < 1 ||
      data.exercises.length > 20
    )
      return null;
    for (const exercise of data.exercises) {
      if (
        typeof exercise.key !== "string" ||
        typeof exercise.name !== "string" ||
        !Array.isArray(exercise.sets) ||
        exercise.sets.length < 1 ||
        exercise.sets.length > 30
      )
        return null;
      for (const set of exercise.sets) {
        if (
          typeof set.key !== "string" ||
          typeof set.weight !== "string" ||
          typeof set.reps !== "string"
        )
          return null;
      }
    }
    return data;
  } catch {
    return null;
  }
}

export function workoutPayload(draft: Draft) {
  const exercises = draft.exercises.map((exercise) => {
    if (!exercise.name.trim()) throw new Error("種目を選んでください。");
    return {
      name: exercise.name.trim(),
      sets: exercise.sets.map((set) => {
        const weight = Number(set.weight);
        const reps = Number(set.reps);
        if (
          !set.weight.trim() ||
          !set.reps.trim() ||
          !Number.isFinite(weight) ||
          weight < 0 ||
          weight > 1000 ||
          Math.abs(weight * 10 - Math.round(weight * 10)) > 0.00001 ||
          !Number.isInteger(reps) ||
          reps < 1 ||
          reps > 1000
        ) {
          throw new Error("重量: 0〜1,000kg・小数1桁まで。回数: 1〜1,000の整数。");
        }
        return { weight, reps };
      }),
    };
  });
  return {
    id: draft.id,
    performed_on: draft.performed_on,
    group_id: draft.group_id || null,
    exercises,
  };
}

export function editDraft(record: Workout): Draft {
  return {
    id: record.id,
    performed_on: record.performed_on,
    group_id: record.group_id ?? "",
    exercises: record.exercises.map((exercise) => ({
      key: crypto.randomUUID(),
      name: exercise.name,
      sets: exercise.sets.map((set) => ({
        key: crypto.randomUUID(),
        weight: String(set.weight),
        reps: String(set.reps),
      })),
    })),
  };
}

export function reuseDraft(record: Pick<Workout, "exercises">): Draft {
  return {
    id: crypto.randomUUID(),
    performed_on: today(),
    group_id: "",
    exercises: record.exercises.map((exercise) => ({
      key: crypto.randomUUID(),
      name: exercise.name,
      sets: exercise.sets.map((set) => ({
        key: crypto.randomUUID(),
        weight: String(set.weight),
        reps: String(set.reps),
      })),
    })),
  };
}
