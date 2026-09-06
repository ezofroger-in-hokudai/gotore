import { api } from "@/lib/api";
import { useEffect, useState } from "react";

export function useResource<T>(path: string | null, refreshKey = 0, poll = false) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 保存後・再試行の操作でも再取得する。
  useEffect(() => {
    setData(null);
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
        const value = await api<T>(path, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setData(value);
          setError("");
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "取得できませんでした。");
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
  }, [path, refreshKey, retryKey, poll]);
  return { data, error, loading, retry: () => setRetryKey((value) => value + 1) };
}
