import type { RecordSnapshot } from "@/lib/record-snapshot";
import type { Analytics, Grain, Point, Totals } from "../analytics/types";
import { normalizeBodyPart } from "../exercises/body-parts";

type Row = {
  date: string;
  exercise: string;
  sets: number;
  volume: number;
  weight: number;
  rm: number | null;
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;
const dateValue = (value: string) => new Date(`${value}T00:00:00Z`);
const dateString = (value: Date) => value.toISOString().slice(0, 10);

function nextDate(value: string, days: number) {
  const result = dateValue(value);
  result.setUTCDate(result.getUTCDate() + days);
  return dateString(result);
}

function bucketStart(value: string, grain: Grain) {
  if (grain === "month") return `${value.slice(0, 7)}-01`;
  if (grain === "week") return nextDate(value, -((dateValue(value).getUTCDay() + 6) % 7));
  return value;
}

function nextBucket(value: string, grain: Grain) {
  if (grain === "month") {
    const result = dateValue(value);
    result.setUTCMonth(result.getUTCMonth() + 1);
    return dateString(result);
  }
  return nextDate(value, grain === "week" ? 7 : 1);
}

function totals(rows: Row[]): Totals {
  const weight = rows.reduce<Row | null>(
    (best, row) =>
      !best ||
      row.weight > best.weight ||
      (row.weight === best.weight && row.exercise > best.exercise)
        ? row
        : best,
    null,
  );
  const rm = rows.reduce<Row | null>(
    (best, row) =>
      row.rm !== null &&
      (!best || row.rm > (best.rm ?? -1) || (row.rm === best.rm && row.exercise > best.exercise))
        ? row
        : best,
    null,
  );
  return {
    sets: rows.reduce((total, row) => total + row.sets, 0),
    volume: round(rows.reduce((total, row) => total + row.volume, 0)),
    days: new Set(rows.map((row) => row.date)).size,
    people: rows.length ? 1 : 0,
    weight: weight ? round(weight.weight) : null,
    rm: rm?.rm ?? null,
    weight_exercise: weight?.exercise ?? null,
    rm_exercise: rm?.exercise ?? null,
  };
}

function series(rows: Row[], start: string, end: string): Analytics["series"] {
  const result: Analytics["series"] = {};
  const days = Math.round((dateValue(end).getTime() - dateValue(start).getTime()) / 86_400_000) + 1;
  for (const grain of (["day", "week", "month"] as const).filter(
    (value) => value !== "day" || days <= 366,
  )) {
    const buckets = new Map<string, Row[]>();
    for (const row of rows) {
      const key = bucketStart(row.date, grain);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }
    const points: Point[] = [];
    for (
      let cursor = bucketStart(start, grain);
      cursor <= end;
      cursor = nextBucket(cursor, grain)
    ) {
      const following = nextBucket(cursor, grain);
      points.push({
        start: cursor < start ? start : cursor,
        end: nextDate(following, -1) > end ? end : nextDate(following, -1),
        ...totals(buckets.get(cursor) ?? []),
      });
    }
    result[grain] = points;
  }
  return result;
}

export function personalAnalytics(
  snapshot: RecordSnapshot,
  today: string,
  exercise: string | null,
  bodyPart: string | null,
): Analytics {
  const parts = new Map(snapshot.options.map((option) => [option.name, option.primary_body_part]));
  const names = new Set<string>();
  const rows: Row[] = [];
  for (const record of snapshot.workouts) {
    if (record.performed_on > today || record.performed_on < "2000-01-01") continue;
    for (const item of record.exercises) {
      if (!item.sets.length) continue;
      names.add(item.name);
      if (exercise && item.name !== exercise) continue;
      if (bodyPart && normalizeBodyPart(parts.get(item.name)) !== bodyPart) continue;
      let bestRm: number | null = null;
      for (const set of item.sets) {
        if (set.weight <= 0 || set.reps < 1 || set.reps > 10) continue;
        const value = round(set.weight * (set.reps === 1 ? 1 : 1 + set.reps / 30));
        bestRm = Math.max(bestRm ?? value, value);
      }
      rows.push({
        date: record.performed_on,
        exercise: item.name,
        sets: item.sets.length,
        volume: item.sets.reduce((total, set) => total + set.weight * set.reps, 0),
        weight: Math.max(...item.sets.map((set) => set.weight)),
        rm: bestRm,
      });
    }
  }
  const start = rows.reduce((earliest, row) => (row.date < earliest ? row.date : earliest), today);
  return {
    window: {
      period: "all",
      offset: 0,
      start: "2000-01-01",
      end: today,
      previous_start: null,
      previous_end: null,
      can_previous: false,
    },
    exercise,
    exercises: [...names].sort((a, b) => a.localeCompare(b, "ja")),
    totals: totals(rows),
    previous_totals: null,
    series: series(rows, start, today),
    rankings: {},
  };
}
