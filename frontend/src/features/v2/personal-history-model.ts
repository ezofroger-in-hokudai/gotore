import type { ActivityDay, BodyPart, HistorySummary } from "@/lib/api";
import { addDays } from "../analytics/period";
import type { Analytics } from "../analytics/types";

export type HistoryScope = { part: BodyPart | "all"; exercise: string };
export type HistoryGrain = "week" | "month" | "all";

export function recentExercises(summary: HistorySummary | undefined, part: BodyPart | "all") {
  return (summary?.exercises ?? [])
    .filter((item) => part === "all" || item.body_part === part)
    .sort(
      (a, b) =>
        b.last_performed_on.localeCompare(a.last_performed_on) || a.name.localeCompare(b.name),
    );
}

export function graphPoints(
  data: Analytics | undefined,
  grain: HistoryGrain,
  firstPerformedOn?: string | null,
) {
  const source = data?.series[grain === "week" ? "week" : "month"] ?? [];
  return source.filter((point) => !firstPerformedOn || point.end >= firstPerformedOn);
}

export function recentPartAges(
  days: ActivityDay[],
  current: string,
): Partial<Record<BodyPart, number>> {
  const oldest = addDays(current, -3);
  const found: Partial<Record<BodyPart, number>> = {};
  for (let age = 0; age <= 3; age++) {
    const date = addDays(current, -age);
    if (date < oldest) continue;
    const day = days.find((item) => item.date === date);
    for (const entry of day?.body_parts ?? []) {
      const part = entry.body_part;
      if (part && part !== "full_body" && found[part] === undefined) found[part] = age;
    }
  }
  return found;
}

export function smoothGraphPath(points: [number, number][]) {
  if (!points.length) return "";
  let path = `M${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index++) {
    const before = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    path += ` C${current[0] + (next[0] - before[0]) / 6} ${current[1] + (next[1] - before[1]) / 6},${next[0] - (after[0] - current[0]) / 6} ${next[1] - (after[1] - current[1]) / 6},${next[0]} ${next[1]}`;
  }
  return path;
}
