import type { RankMetric } from "./types";
export const metricCategories = { volume: "量", strength: "強さ", activity: "継続" } as const;
export type MetricCategory = keyof typeof metricCategories;
export function metricCategory(metric: RankMetric): MetricCategory {
  if (metric === "volume" || metric === "sets") return "volume";
  if (metric === "days" || metric === "people") return "activity";
  return "strength";
}
