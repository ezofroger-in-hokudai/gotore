export type Period = "week" | "month" | "quarter" | "year" | "all";
export type Grain = "day" | "week" | "month";
export type Metric = "volume" | "sets" | "days" | "people" | "weight" | "rm";
export type RankMetric = Metric | "weight_growth" | "weight_percent" | "rm_growth" | "rm_percent";
export type Totals = Record<Metric, number | null>;
export type Point = Totals & { start: string; end: string };
export type Analytics = {
  window: {
    period: Period;
    offset: number;
    start: string;
    end: string;
    previous_start: string | null;
    previous_end: string | null;
    can_previous: boolean;
  };
  exercise: string | null;
  exercises: string[];
  totals: Totals;
  previous_totals: Totals | null;
  series: Partial<Record<Grain, Point[]>>;
  rankings: Partial<
    Record<
      RankMetric,
      {
        user_id: string;
        display_name: string;
        value: number | null;
        rank: number | null;
        status: "recorded" | "first" | "zero_baseline";
      }[]
    >
  >;
};
export const labels: Record<RankMetric, string> = {
  volume: "総負荷",
  sets: "セット数",
  days: "活動日数",
  people: "活動人数",
  weight: "最高重量",
  rm: "最高推定1RM",
  weight_growth: "重量の成長量",
  weight_percent: "重量の成長率",
  rm_growth: "RMの成長量",
  rm_percent: "RMの成長率",
};
export const units: Record<RankMetric, string> = {
  volume: "kg",
  sets: "セット",
  days: "日",
  people: "人",
  weight: "kg",
  rm: "kg",
  weight_growth: "kg",
  weight_percent: "%",
  rm_growth: "kg",
  rm_percent: "%",
};
export function analyticsPath(scope: string, period: Period, offset: number, exercise: string) {
  const query = new URLSearchParams({ period, offset: String(offset) });
  if (exercise) query.set("exercise", exercise);
  return `${scope}/analytics?${query}`;
}
