import { describe, expect, test } from "bun:test";
import {
  PART_FILTERS,
  filterExercises,
  groupExercises,
  optionParts,
} from "../../src/features/exercises/body-parts";

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
  test("古い応答や削除済みの種目はその他として選べる", () => {
    expect(filterExercises(options, "other", "").map((e) => e.name)).toEqual(["以前の種目"]);
    expect(filterExercises(options, "all", "")).toHaveLength(3);
  });
  test("履歴編集では主な部位に一度だけ分類する", () => {
    expect(groupExercises(options).map((g) => [g.label, g.options.map((e) => e.id)])).toEqual([
      ["胸", ["bench"]],
      ["腕", ["curl"]],
      ["その他", ["old"]],
    ]);
  });
});

test("8分類の並びを固定し、旧全身と未設定の候補をその他へそろえる", () => {
  expect(PART_FILTERS.map((part) => part.label)).toEqual([
    "すべて",
    "胸",
    "背中",
    "脚",
    "腕",
    "肩",
    "腹筋",
    "お尻",
    "その他",
  ]);
  expect(
    optionParts({ primary_body_part: "full_body", secondary_body_parts: ["other", "arms"] }),
  ).toEqual({
    primary_body_part: "other",
    secondary_body_parts: ["arms"],
  });
  expect(optionParts()).toEqual({ primary_body_part: "other", secondary_body_parts: [] });
  const old = [{ name: "全身だった種目", primary_body_part: "full_body" as const }];
  expect(filterExercises(old, "other", "")).toEqual(old);
});
