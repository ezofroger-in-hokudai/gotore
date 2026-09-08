import { describe, expect, test } from "bun:test";
import {
  bestUpdate,
  estimatedRM,
  readSessionInput,
  setValue,
  updateSet,
} from "../../src/features/session/session";

describe("v2セットの業務ルール", () => {
  test("RMは1回が実重量、2〜10回がEpley、範囲外は対象外", () => {
    expect(estimatedRM(80, 8)).toBe(101.3);
    expect(estimatedRM(80, 1)).toBe(80);
    expect(estimatedRM(0, 10)).toBeNull();
    expect(estimatedRM(80, 11)).toBeNull();
  });
  test("初回と同値はBEST更新にしない", () => {
    expect(bestUpdate(80, 8, null)).toBe(false);
    expect(
      bestUpdate(80, 8, {
        best_weight: 80,
        best_rm: 101.3,
        previous: null,
        memo: { content: "", revision: 0 },
      }),
    ).toBe(false);
  });
  test("空欄・小数回数・範囲外を拒否し、0kgを許容", () => {
    expect(() => setValue("", "8")).toThrow();
    expect(() => setValue("80", "1.5")).toThrow();
    expect(() => setValue("1001", "8")).toThrow();
    expect(setValue("0", "10")).toEqual({ weight: 0, reps: 10 });
  });
  test("編集は対象のセットだけを変更し元データを壊さない", () => {
    const before = [
      {
        name: "ベンチ",
        sets: [
          { weight: 80, reps: 8 },
          { weight: 75, reps: 10 },
        ],
      },
    ];
    const after = updateSet(before, "ベンチ", { weight: 82.5, reps: 8 }, 0);
    expect(after[0].sets).toEqual([
      { weight: 82.5, reps: 8 },
      { weight: 75, reps: 10 },
    ]);
    expect(before[0].sets[0].weight).toBe(80);
  });
  test("破損した端末下書きでも復元を妨げない", () => {
    expect(readSessionInput("broken").name).toBe("");
    expect(readSessionInput('{"name":5}').editing).toBeNull();
  });
});

test("旧記録からコピーした同名行も全セット順で編集し、他の行を変えない", () => {
  const before = [
    { name: "ベンチ", sets: [{ weight: 80, reps: 8 }] },
    { name: "スクワット", sets: [{ weight: 100, reps: 5 }] },
    { name: "ベンチ", sets: [{ weight: 75, reps: 10 }] },
  ];
  const after = updateSet(before, "ベンチ", { weight: 77.5, reps: 10 }, 1);
  expect(after[0]).toEqual(before[0]);
  expect(after[1]).toEqual(before[1]);
  expect(after[2].sets[0].weight).toBe(77.5);
});
