import type { Grain, Metric } from "./types";

export function chartKind(metric: Metric): "bar" | "line" {
  return metric === "weight" || metric === "rm" ? "line" : "bar";
}

export function chartGrains(metric: Metric, available: Grain[]): Grain[] {
  return available.filter((grain) => metric !== "days" || grain !== "day");
}

export function chartMaximum(metric: Metric, values: (number | null)[]): number {
  const max = Math.max(1, ...values.map((value) => value ?? 0));
  // 中央の目盛りも整数にし、1日・1人を小数に分割しない。
  return ["sets", "days", "people"].includes(metric) ? Math.ceil(max / 2) * 2 : max;
}
