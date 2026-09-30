import { expect, test } from "bun:test";
import { sessionExerciseOptions } from "../../src/features/session/session-exercise-options";

test("削除された今回の種目へ戻れ、既存候補の分類と順序を変えない", () => {
  const options = [
    {
      id: "bench",
      name: "ベンチプレス",
      primary_body_part: "chest" as const,
      secondary_body_parts: ["arms" as const],
      revision: 3,
    },
  ];
  const result = sessionExerciseOptions(options, [
    { name: "ベンチプレス", sets: [{ weight: 60, reps: 10 }] },
    { name: "削除した種目", sets: [{ weight: 0, reps: 10 }] },
    { name: "削除した種目", sets: [{ weight: 20, reps: 10 }] },
    { name: "記録なし", sets: [] },
  ]);
  expect(result).toEqual([
    options[0],
    {
      id: "session:削除した種目",
      name: "削除した種目",
      primary_body_part: "other",
      secondary_body_parts: [],
    },
  ]);
  expect(options).toHaveLength(1);
});
