import { expect, test } from "bun:test";
import { finishWeekDays, sessionTotals } from "../../src/features/session/finish-week";
import type { TrainingSession, Workout } from "../../src/lib/api";

const workout = (
  id: string,
  performed_on: string,
  sets: { weight: number; reps: number }[],
): Workout => ({
  id,
  performed_on,
  user_id: "user",
  display_name: "画面テスト",
  group_id: null,
  created_at: `${performed_on}T00:00:00Z`,
  revision: 1,
  exercises: sets.length ? [{ name: "ベンチプレス", sets }] : [],
});

test("今回の集計は追加済みセットだけを数える", () => {
  expect(
    sessionTotals([
      {
        name: "ベンチプレス",
        sets: [
          { weight: 60, reps: 10 },
          { weight: 55, reps: 8 },
        ],
      },
      { name: "スクワット", sets: [{ weight: 80, reps: 5 }] },
    ]),
  ).toEqual({ volume: 1440, sets: 3, exercises: 2 });
  expect(sessionTotals([{ name: "ベンチプレス", sets: [{ weight: 50.3, reps: 7 }] }]).volume).toBe(
    352.1,
  );
});

test("同日2回を合算し、取得済みの今回を二重に足さない", () => {
  const current = {
    ...workout("current", "2026-09-29", [{ weight: 376, reps: 10 }]),
    started_at: "2026-09-29T01:00:00Z",
    ended_at: null,
  } as TrainingSession;
  const records = [
    workout("first", "2026-09-29", [{ weight: 140, reps: 10 }]),
    workout("first", "2026-09-29", [{ weight: 140, reps: 10 }]),
    workout("current", "2026-09-29", [{ weight: 320, reps: 10 }]),
    workout("yesterday", "2026-09-28", [{ weight: 412, reps: 10 }]),
  ];
  const days = finishWeekDays("2026-09-29", records, current);
  expect(days).toHaveLength(7);
  expect(days.at(-1)).toEqual({ date: "2026-09-29", volume: 5160, workoutCount: 2 });
  expect(days.at(-2)).toEqual({ date: "2026-09-28", volume: 4120, workoutCount: 1 });
});

test("月境界をまたぐ7暦日を表示し、記録なしと0kg記録を区別する", () => {
  const current = {
    ...workout("current", "2026-03-01", []),
    started_at: "2026-03-01T01:00:00Z",
    ended_at: null,
  } as TrainingSession;
  const days = finishWeekDays(
    "2026-03-01",
    [
      workout("old", "2026-02-22", [{ weight: 100, reps: 10 }]),
      workout("zero", "2026-02-23", [{ weight: 0, reps: 10 }]),
      workout("empty", "2026-02-24", []),
    ],
    current,
  );
  expect(days.map((day) => day.date)).toEqual([
    "2026-02-23",
    "2026-02-24",
    "2026-02-25",
    "2026-02-26",
    "2026-02-27",
    "2026-02-28",
    "2026-03-01",
  ]);
  expect(days[0]).toEqual({ date: "2026-02-23", volume: 0, workoutCount: 1 });
  expect(days[1]).toEqual({ date: "2026-02-24", volume: 0, workoutCount: 0 });
  expect(days.at(-1)).toEqual({ date: "2026-03-01", volume: 0, workoutCount: 0 });
});
