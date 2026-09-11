import { expect, test } from "bun:test";
import { calendarDays, shiftMonth } from "../../src/features/activity/calendar";

test("月曜始まりでうるう日・月末・年越しを正しい日付へ配置する", () => {
  const days = calendarDays("2024-02");
  expect(days.slice(0, 4)).toEqual([null, null, null, "2024-02-01"]);
  expect(days.filter(Boolean)).toHaveLength(29);
  expect(days).toContain("2024-02-29");
  expect(days).not.toContain("2024-03-01");
  expect(days.length % 7).toBe(0);
  expect(calendarDays("2023-02").filter(Boolean)).toHaveLength(28);
  expect(shiftMonth("2024-12", 1)).toBe("2025-01");
  expect(shiftMonth("2025-01", -1)).toBe("2024-12");
});
