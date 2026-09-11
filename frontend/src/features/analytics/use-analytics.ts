import { useEffect, useState, useSyncExternalStore } from "react";
import { resourceRequest } from "../training/resource-request";
import { AnalyticsCache } from "./cache";
import { type Analytics, type Period, analyticsPath } from "./types";

export function useAnalytics(
  scope: string,
  period: Period,
  offset: number,
  exercise: string,
  active: boolean,
  prefetch: boolean,
  refreshKey: number,
) {
  const [cache] = useState(
    () => new AnalyticsCache<Analytics>(resourceRequest, undefined, scope ? 5000 : 60_000),
  );
  const path = analyticsPath(scope, period, offset, exercise);
  useSyncExternalStore(cache.subscribe, cache.snapshot, cache.snapshot);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 保存や共有変更で全期間の集計を無効化する。
  useEffect(() => {
    cache.clear();
  }, [cache, refreshKey]);
  useEffect(() => () => cache.clear(), [cache]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 無効化した直後にも選択中の集計を取得する。
  useEffect(() => {
    cache.select(path);
    if (!active && !prefetch) {
      cache.stop();
      return;
    }
    const load = () => {
      if (!document.hidden) cache.request(path, active, Boolean(scope) && active);
      else cache.stop();
    };
    load();
    const timer = active && scope ? window.setInterval(load, 5000) : undefined;
    document.addEventListener("visibilitychange", load);
    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [cache, path, active, prefetch, scope, refreshKey]);
  const entry = cache.read(path);
  useEffect(() => {
    if ((!active && !prefetch) || document.hidden || !entry?.data || entry.loading) return;
    // 閲覧中の応答を優先し、隣の期間とよく使う種目だけを準備する。
    const timer = window.setTimeout(() => {
      if (document.hidden) return;
      const candidates = [
        analyticsPath(
          scope,
          period === "month" ? (scope ? "week" : "quarter") : "month",
          0,
          exercise,
        ),
        analyticsPath(scope, period, offset, exercise ? "" : (entry.data?.exercises[0] ?? "")),
      ];
      for (const candidate of candidates) if (candidate !== path) cache.request(candidate);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [cache, path, scope, period, offset, exercise, active, prefetch, entry?.data, entry?.loading]);
  return {
    data: entry?.data,
    error: entry?.error,
    loading: entry?.loading ?? !entry,
    retry: () => cache.request(path, true, true),
  };
}
