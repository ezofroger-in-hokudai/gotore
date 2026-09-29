import type { RecordSnapshot } from "@/lib/record-snapshot";
import { useEffect, useMemo, useRef, useState } from "react";
import { cachedRecordResource } from "../record-cache/cached-resource";
import { useRecordSnapshot } from "../record-cache/record-snapshot-provider";
import { resourceRequest } from "./resource-request";
import { canRetainResource } from "./retain-resource";

export function useResource<T>(
  path: string | null,
  refreshKey = 0,
  poll: boolean | number | ((data: T | undefined) => number) = false,
  remember = false,
  options: { enabled?: boolean; retainOnRefresh?: boolean; prefetch?: boolean } = {},
) {
  const { enabled = true, retainOnRefresh = false, prefetch = false } = options;
  const recordSnapshot = useRecordSnapshot()?.snapshot ?? null;
  const latestSnapshot = useRef(recordSnapshot);
  latestSnapshot.current = recordSnapshot;
  const localData = useMemo(
    () => cachedRecordResource(recordSnapshot, path) as T | null,
    [recordSnapshot, path],
  );
  const cache = useRef({
    version: refreshKey,
    pages: new Map<string, { data: T; savedAt: number; snapshot: RecordSnapshot | null }>(),
  });
  const [result, setResult] = useState<{
    path: string;
    data: T;
    version: number;
    stale: boolean;
    source: "local" | "server";
    snapshot: RecordSnapshot | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const writes = useRef(0);
  const serverResult = useRef<{
    path: string;
    version: number;
    terminal: boolean;
    blocked: boolean;
    snapshot: RecordSnapshot | null;
  }>({ path: "", version: -1, terminal: false, blocked: false, snapshot: null });
  // biome-ignore lint/correctness/useExhaustiveDependencies: 保存後・再試行の操作でも再取得する。
  useEffect(() => {
    // 非表示中の無効化は再訪時に処理し、同じ種目の比較・メモを更新中も保持する。
    if (!enabled && !prefetch) {
      setLoading(false);
      return;
    }
    // 同じ一覧の再取得では選択状態を保持し、別の共有先のデータは返さない。
    const changed = cache.current.version !== refreshKey;
    if (changed) {
      cache.current = { version: refreshKey, pages: new Map() };
    }
    const previous = path && remember ? cache.current.pages.get(path) : undefined;
    if (path && previous && Date.now() - previous.savedAt < 60_000) {
      setResult({
        path,
        data: previous.data,
        version: refreshKey,
        stale: true,
        source: "server",
        snapshot: previous.snapshot,
      });
    } else {
      setResult((current) =>
        current?.path === path && (!changed || retainOnRefresh) ? current : null,
      );
    }
    setError("");
    if (!path) {
      setLoading(false);
      return;
    }
    serverResult.current = {
      path,
      version: refreshKey,
      terminal: false,
      blocked: false,
      snapshot: latestSnapshot.current,
    };
    const controller = new AbortController();
    let pending = false;
    let latest = previous?.data;
    let timer: number | undefined;
    const schedule = () => {
      if (!poll || controller.signal.aborted || document.hidden) return;
      const delay = typeof poll === "function" ? poll(latest) : poll === true ? 5000 : poll;
      timer = window.setTimeout(() => void load(), delay);
    };
    const load = async () => {
      if (pending || ((poll || prefetch) && document.hidden)) return;
      window.clearTimeout(timer);
      pending = true;
      setLoading(true);
      const startedBeforeWrite = writes.current;
      const startedSnapshot = latestSnapshot.current;
      try {
        const value = await resourceRequest<T>(path, controller.signal);
        if (!controller.signal.aborted && startedBeforeWrite === writes.current) {
          if (
            startedSnapshot !== latestSnapshot.current &&
            cachedRecordResource(latestSnapshot.current, path) !== null
          )
            return;
          latest = value;
          serverResult.current.terminal = true;
          serverResult.current.snapshot = startedSnapshot;
          setResult({
            path,
            data: value,
            version: refreshKey,
            stale: false,
            source: "server",
            snapshot: startedSnapshot,
          });
          if (remember) {
            cache.current.pages.delete(path);
            cache.current.pages.set(path, {
              data: value,
              savedAt: Date.now(),
              snapshot: startedSnapshot,
            });
            if (cache.current.pages.size > 5) {
              const oldest = cache.current.pages.keys().next().value;
              if (oldest) cache.current.pages.delete(oldest);
            }
          }
          setError("");
        }
      } catch (reason) {
        if (!controller.signal.aborted && startedBeforeWrite === writes.current) {
          if (!canRetainResource(reason)) {
            serverResult.current.terminal = true;
            serverResult.current.blocked = true;
            cache.current.pages.clear();
            setResult(null);
          } else {
            setResult((current) => (current?.path === path ? { ...current, stale: true } : null));
          }
          setError(reason instanceof Error ? reason.message : "取得できませんでした。");
        }
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
        schedule();
      }
    };
    void load();
    const visible = () => {
      if (document.hidden) window.clearTimeout(timer);
      else void load();
    };
    if (poll) document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [path, refreshKey, retryKey, poll, remember, enabled, retainOnRefresh, prefetch]);
  useEffect(() => {
    if (
      !enabled ||
      localData === null ||
      !path ||
      (serverResult.current.path === path &&
        serverResult.current.version === refreshKey &&
        (serverResult.current.blocked ||
          (serverResult.current.terminal && serverResult.current.snapshot === recordSnapshot)))
    )
      return;
    setResult((current) =>
      current?.path === path &&
      current.version === refreshKey &&
      current.source === "server" &&
      current.snapshot === recordSnapshot
        ? current
        : {
            path,
            data: localData,
            version: refreshKey,
            stale: true,
            source: "local",
            snapshot: recordSnapshot,
          },
    );
  }, [enabled, localData, path, refreshKey, recordSnapshot]);
  return {
    data:
      result?.path === path && (!remember || retainOnRefresh || result.version === refreshKey)
        ? result.data
        : null,
    refreshing: result?.path === path && result.stale,
    error,
    loading,
    retry: () => setRetryKey((value) => value + 1),
    updateData: (update: (current: T | null) => T) => {
      if (!path) return;
      // 成功した更新より前に始めたGETで、確定内容を巻き戻さない。
      writes.current++;
      serverResult.current = {
        path,
        version: refreshKey,
        terminal: true,
        blocked: false,
        snapshot: latestSnapshot.current,
      };
      cache.current.pages.delete(path);
      setError("");
      setResult((current) => ({
        path,
        data: update(current?.path === path ? current.data : null),
        version: refreshKey,
        stale: false,
        source: "server",
        snapshot: latestSnapshot.current,
      }));
    },
  };
}
