import type { ExerciseContext } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { resourceRequest } from "../training/resource-request";
import { ExerciseContextCache } from "./exercise-context-cache";

export function useExerciseContext(
  sessionId: string | null,
  name: string,
  candidates: string[],
  revision: number,
  enabled: boolean,
) {
  const [, render] = useState(0);
  const currentSessionId = useRef(sessionId);
  currentSessionId.current = sessionId;
  const [cache] = useState(
    () =>
      new ExerciseContextCache(
        (candidate, signal) =>
          resourceRequest<ExerciseContext>(
            `/exercises/context?name=${encodeURIComponent(candidate)}${currentSessionId.current ? `&session_id=${currentSessionId.current}` : ""}`,
            signal,
          ),
        () => render((value) => value + 1),
      ),
  );
  const [retry, setRetry] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 開始確定後は実際のセッションを基準に取り直す。
  useEffect(() => {
    if (enabled) cache.invalidate();
    else cache.stop();
  }, [cache, enabled, sessionId]);
  const wanted = JSON.stringify([name, ...candidates.slice(0, 3)]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 再試行・メモ保存後にも無効化した比較を取得する。
  useEffect(() => {
    if (!enabled) {
      cache.stop();
      return;
    }
    const prepare = () => {
      if (document.hidden) cache.stop();
      else cache.prepare(JSON.parse(wanted), revision);
    };
    prepare();
    const visible = () => {
      if (!document.hidden) cache.invalidate();
      prepare();
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [cache, enabled, wanted, revision, retry, sessionId]);
  useEffect(() => () => cache.stop(), [cache]);
  const entry = cache.read(name);
  return {
    data: entry?.data ?? null,
    firstPreviousSet: (candidate: string) => cache.read(candidate)?.data?.previous?.sets[0],
    error: entry?.error ?? "",
    retry: () => {
      cache.invalidate(name);
      setRetry((value) => value + 1);
    },
  };
}
