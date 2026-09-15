import type { Grain, Metric, Period, Point } from "./types";

export const iso = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return iso(value);
};
export function shiftAnchor(anchor: string, period: Period, direction: number): string {
  if (period === "all") return anchor;
  if (period === "week") return addDays(anchor, direction * 7);
  const value = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + direction * { month: 1, quarter: 3, year: 12 }[period]);
  return iso(value);
}
export function frameEnd(end: string, period: Period): string {
  if (period === "all") return end;
  const value = new Date(`${end}T00:00:00Z`);
  if (period === "week") return addDays(end, (7 - value.getUTCDay()) % 7);
  value.setUTCMonth(value.getUTCMonth() + 1, 0);
  return iso(value);
}
export function periodGrains(period: Period, metric: Metric, available: Grain[]): Grain[] {
  const permitted: Grain[] =
    period === "week"
      ? ["day"]
      : period === "month"
        ? metric === "days"
          ? ["week"]
          : ["day", "week"]
        : period === "quarter"
          ? ["week", "month"]
          : ["month"];
  return permitted.filter((grain) => available.includes(grain));
}
export type DisplayPoint = Point & { future?: boolean };
export function framePoints(
  points: Point[],
  period: Period,
  grain: Grain,
  end: string,
): DisplayPoint[] {
  const result: DisplayPoint[] = [...points];
  const last = result.at(-1);
  if (!last || grain !== "day") return result;
  const fullEnd = frameEnd(end, period);
  for (let day = addDays(last.end, 1); day <= fullEnd; day = addDays(day, 1)) {
    result.push({
      start: day,
      end: day,
      volume: null,
      sets: null,
      days: null,
      people: null,
      weight: null,
      rm: null,
      future: true,
    });
  }
  return result;
}
