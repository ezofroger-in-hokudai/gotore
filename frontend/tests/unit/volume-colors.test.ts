import { expect, test } from "bun:test";
import { volumeAppearance, volumeGradient } from "../../src/features/activity/volume-colors";

test("記録なしは灰色、0kgは青、月の最大は赤で紫を通らない", () => {
  expect(volumeAppearance(null, 1000)).toHaveProperty("--activity-bg", "rgb(232, 233, 237)");
  expect(volumeAppearance(0, 0)).toHaveProperty("--activity-bg", "rgb(36, 106, 211)");
  expect(volumeAppearance(1000, 1000)).toHaveProperty("--activity-bg", "rgb(217, 35, 46)");
  expect(volumeAppearance(500, 1000)).toHaveProperty("--activity-bg", "rgb(232, 202, 74)");
  expect(volumeAppearance(100, 200)).toEqual(volumeAppearance(500, 1000));
  expect(volumeAppearance(2000, 1000)).toEqual(volumeAppearance(1000, 1000));
  expect(volumeGradient).toContain("87, 173, 131");
});
