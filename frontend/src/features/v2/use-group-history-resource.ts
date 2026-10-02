import { useEffect, useSyncExternalStore } from "react";
import type { ResourceCache } from "../training/resource-cache";

export function useGroupHistoryResource<T>(
  cache: ResourceCache<T>,
  path: string | null,
  active: boolean,
  refreshKey: number,
) {
  useSyncExternalStore(cache.subscribe, cache.snapshot, cache.snapshot);
  useEffect(() => cache.setVersion(refreshKey), [cache, refreshKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 保存後は表示を残して再確認する。
  useEffect(() => {
    if (!active || !path) return;
    cache.select(path);
    const load = () => {
      if (!document.hidden) cache.request(path, true, true);
      else cache.stop();
    };
    load();
    document.addEventListener("visibilitychange", load);
    window.addEventListener("online", load);
    return () => {
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener("online", load);
      cache.stop();
    };
  }, [cache, path, active, refreshKey]);
  const entry = path ? cache.read(path) : undefined;
  return {
    data: entry?.data ?? null,
    error: entry?.error ?? "",
    loading: !!path && (entry?.loading ?? !entry),
    retry: () => {
      if (path && active) cache.request(path, true, true);
    },
  };
}
