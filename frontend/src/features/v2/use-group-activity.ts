import type { Group, GroupActivity } from "@/lib/api";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ResourceCache } from "../training/resource-cache";
import { resourceRequest } from "../training/resource-request";
import { activityRefreshMs } from "./refresh-interval";

export function useGroupActivity(
  groups: Group[],
  selected: string,
  active: boolean,
  refreshKey: number,
) {
  const [cache] = useState(
    () => new ResourceCache<GroupActivity>(resourceRequest, Date.now, 60_000, 5, false),
  );
  const revision = useSyncExternalStore(cache.subscribe, cache.snapshot, cache.snapshot);
  const path = selected ? `/groups/${selected}/activity` : "";
  const ids = groups
    .map((group) => group.id)
    .sort()
    .join(",");
  const order = groups.map((group) => group.id).join(",");
  const unverified = useRef<GroupActivity | undefined>(undefined);
  const latestPath = useRef(path);
  latestPath.current = path;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 保存・所属変更では先読み分も破棄する。
  useEffect(() => {
    cache.clear();
  }, [cache, refreshKey, ids]);
  useEffect(() => () => cache.clear(), [cache]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 無効化直後と再訪時も所属・共有可否を確認する。
  useEffect(() => {
    cache.select(path);
    if (!active || !path) {
      cache.stop();
      return;
    }
    const load = () => {
      if (document.hidden) cache.stop();
      else {
        unverified.current = cache.read(path)?.data;
        cache.request(path, true, true);
      }
    };
    load();
    document.addEventListener("visibilitychange", load);
    return () => document.removeEventListener("visibilitychange", load);
  }, [cache, active, path, refreshKey, ids]);

  const entry = cache.read(path);
  useEffect(() => {
    if (!active || !path || entry?.loading || document.hidden) return;
    const timer = window.setTimeout(() => {
      if (!document.hidden) cache.request(path, true, true);
    }, activityRefreshMs(entry?.data));
    return () => window.clearTimeout(timer);
  }, [cache, active, path, entry]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 完了通知で同時2要求の空きを使い、左右の隣まで準備する。
  useEffect(() => {
    if (!active || !path || document.hidden || !entry?.data || entry.error) return;
    const index = groups.findIndex((group) => group.id === selected);
    for (const group of [groups[index + 1], groups[index - 1]]) {
      if (!group) continue;
      const next = `/groups/${group.id}/activity`;
      // 失敗した先読みを自動で繰り返さず、選択時・再試行時に確認する。
      const prepared = cache.read(next);
      if (!prepared) cache.request(next);
    }
  }, [cache, active, path, ids, order, selected, revision, entry]);

  const displayed = useRef<{ path: string; data: GroupActivity | null }>({ path: "", data: null });
  const changedPath = displayed.current.path !== path;
  const data =
    entry?.data &&
    (Date.now() - entry.savedAt < 60_000 || (!changedPath && displayed.current.data === entry.data))
      ? entry.data
      : null;
  displayed.current = { path, data };
  return {
    data,
    loading: entry?.loading ?? !!path,
    refreshing: !!data && (data === unverified.current || !!entry?.error || changedPath),
    error: entry?.error ?? "",
    retry: () => {
      if (latestPath.current) cache.request(latestPath.current, true, true);
    },
  };
}
