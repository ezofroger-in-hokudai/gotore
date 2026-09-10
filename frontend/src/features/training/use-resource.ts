import { useEffect, useRef, useState } from "react";
import { resourceRequest } from "./resource-request";

export function useResource<T>(
  path: string | null,
  refreshKey = 0,
  poll = false,
  remember = false,
  options: { enabled?: boolean; retainOnRefresh?: boolean } = {},
) {
  const { enabled = true, retainOnRefresh = false } = options;
  const cache = useRef({
    version: refreshKey,
    pages: new Map<string, { data: T; savedAt: number }>(),
  });
  const [result, setResult] = useState<{
    path: string;
    data: T;
    version: number;
    stale: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 保存後・再試行の操作でも再取得する。
  useEffect(() => {
    // 非表示中の無効化は再訪時に処理し、同じ種目の比較・メモを更新中も保持する。
    if (!enabled) {
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
      setResult({ path, data: previous.data, version: refreshKey, stale: true });
    } else {
      setResult((current) =>
        current?.path === path && (!remember || (changed && retainOnRefresh)) ? current : null,
      );
    }
    setError("");
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending || (poll && document.hidden)) return;
      pending = true;
      setLoading(true);
      try {
        const value = await resourceRequest<T>(path, controller.signal);
        if (!controller.signal.aborted) {
          setResult({ path, data: value, version: refreshKey, stale: false });
          if (remember) {
            cache.current.pages.delete(path);
            cache.current.pages.set(path, { data: value, savedAt: Date.now() });
            if (cache.current.pages.size > 5) {
              const oldest = cache.current.pages.keys().next().value;
              if (oldest) cache.current.pages.delete(oldest);
            }
          }
          setError("");
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          if (remember) {
            cache.current.pages.delete(path);
            setResult(null);
          }
          setError(reason instanceof Error ? reason.message : "取得できませんでした。");
        }
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    const timer = poll ? window.setInterval(() => void load(), 5000) : undefined;
    const visible = () => {
      if (!document.hidden) void load();
    };
    if (poll) document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [path, refreshKey, retryKey, poll, remember, enabled, retainOnRefresh]);
  return {
    data:
      result?.path === path && (!remember || retainOnRefresh || result.version === refreshKey)
        ? result.data
        : null,
    refreshing: result?.path === path && result.stale,
    error,
    loading,
    retry: () => setRetryKey((value) => value + 1),
  };
}
