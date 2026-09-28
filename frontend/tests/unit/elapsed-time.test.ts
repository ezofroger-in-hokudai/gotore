import { expect, test } from "bun:test";
import { formatElapsedTime } from "../../src/features/session/elapsed-time";

test("進行中セッションの開始からの経過時間を分単位で表示する", () => {
  const start = "2026-09-29T00:00:00.000Z";
  const at = Date.parse(start);
  expect(formatElapsedTime(start, at)).toBe("0分");
  expect(formatElapsedTime(start, at + 12 * 60_000 + 30_000)).toBe("12分");
  expect(formatElapsedTime(start, at + 72 * 60_000)).toBe("1時間12分");
  expect(formatElapsedTime(start, at - 60_000)).toBe("0分");
  expect(formatElapsedTime("invalid", at)).toBeNull();
});
