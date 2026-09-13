import { describe, expect, test } from "bun:test";
import { filterExercises, groupExercises } from "../../src/features/exercises/body-parts";

const options = [
  {
    id: "bench",
    name: "ベンチプレス",
    primary_body_part: "chest" as const,
    secondary_body_parts: ["arms" as const],
  },
  { id: "curl", name: "カール", primary_body_part: "arms" as const },
  { id: "old", name: "以前の種目" },
];
describe("本人の部位分類", () => {
  test("主部位と補助部位を検索と組み合わせ、元の候補を変更しない", () => {
    expect(filterExercises(options, "arms", "").map((e) => e.name)).toEqual([
      "ベンチプレス",
      "カール",
    ]);
    expect(filterExercises(options, "arms", " ベンチ ").map((e) => e.name)).toEqual([
      "ベンチプレス",
    ]);
    expect(filterExercises(options, "back", "")).toEqual([]);
    expect(options).toHaveLength(3);
  });
  test("古い応答や削除済みの種目は未分類として選べる", () => {
    expect(filterExercises(options, "unclassified", "").map((e) => e.name)).toEqual(["以前の種目"]);
    expect(filterExercises(options, "all", "")).toHaveLength(3);
  });
  test("履歴編集では主な部位に一度だけ分類する", () => {
    expect(groupExercises(options).map((g) => [g.label, g.options.map((e) => e.id)])).toEqual([
      ["胸", ["bench"]],
      ["腕", ["curl"]],
      ["未分類", ["old"]],
    ]);
  });
});
