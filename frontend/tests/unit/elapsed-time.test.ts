import { expect, test } from "bun:test";
import { describeElapsedTime, formatElapsedTime } from "../../src/features/session/elapsed-time";

test("進行中セッションの開始からの経過時間を時間:分で表示する", () => {
  const start = "2026-09-29T00:00:00.000Z";
  const at = Date.parse(start);
  expect(formatElapsedTime(start, at)).toBe("0:00");
  expect(formatElapsedTime(start, at + 12 * 60_000 + 30_000)).toBe("0:12");
  expect(formatElapsedTime(start, at + 10 * 60_000)).toBe("0:10");
  expect(formatElapsedTime(start, at + 72 * 60_000)).toBe("1:12");
  expect(formatElapsedTime(start, at - 60_000)).toBe("0:00");
  expect(formatElapsedTime("invalid", at)).toBeNull();
  expect(describeElapsedTime("0:10")).toBe("10分");
  expect(describeElapsedTime("1:12")).toBe("1時間12分");
});
