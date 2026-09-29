import { expect, test } from "bun:test";
import { heatLevel } from "../../src/features/v2/history-calendar-heat";

test("月内の負荷を4段階に分け、近い値だけでも色の差を出す", () => {
  const volumes = [3400, 3600, 3800, 4000];
  expect(volumes.map((volume) => heatLevel(volume, volumes))).toEqual([1, 2, 3, 4]);
});

test("記録なしと0kgは分け、同じ負荷だけの月は活動色にする", () => {
  expect(heatLevel(null, [0, 0])).toBe(0);
  expect(heatLevel(0, [0, 0])).toBe(1);
  expect(heatLevel(2000, [2000, 2000])).toBe(4);
});
