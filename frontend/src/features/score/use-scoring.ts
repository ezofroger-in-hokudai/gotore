import { type ScoreDetail, api } from "@/lib/api";
import { useEffect, useRef, useState } from "react";

type ScoreState = { data: ScoreDetail | null; error: string; busy: boolean };

export function useScoring(onChanged: () => void) {
  const [results, setResults] = useState<Record<string, ScoreState>>({});
  const requests = useRef(new Map<string, AbortController>());
  const changed = useRef(onChanged);
  changed.current = onChanged;
  useEffect(
    () => () => {
      for (const request of requests.current.values()) request.abort();
      requests.current.clear();
    },
    [],
  );
  async function evaluate(id: string) {
    if (requests.current.has(id)) return;
    const controller = new AbortController();
    requests.current.set(id, controller);
    const update = (value: Partial<ScoreState>) => {
      if (controller.signal.aborted) return;
      setResults((current) => {
        const next = {
          ...current,
          [id]: { ...(current[id] ?? { data: null, error: "", busy: true }), ...value },
        };
        const keys = Object.keys(next);
        if (keys.length > 10) delete next[keys[0]];
        return next;
      });
    };
    update({ error: "", busy: true });
    // 詳細の表示とAI採点を別要求にし、目標・内訳だけを先に表示する。
    void api<ScoreDetail | null>(`/workouts/${id}/score`, { signal: controller.signal })
      .then((data) => {
        if (requests.current.get(id) === controller) update({ data });
      })
      .catch(() => {});
    try {
      let data = await api<ScoreDetail | null>(`/workouts/${id}/score/evaluate`, {
        method: "POST",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
      });
      // 別端末で採点中の場合は結果だけ確認し、LLMを再実行しない。
      for (let attempt = 0; data?.status === "processing" && attempt < 15; attempt++) {
        update({ data });
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            window.clearTimeout(timer);
            reject(new Error("中断しました"));
          };
          const timer = window.setTimeout(() => {
            controller.signal.removeEventListener("abort", abort);
            resolve();
          }, 2000);
          if (controller.signal.aborted) abort();
          else controller.signal.addEventListener("abort", abort, { once: true });
        });
        data = await api<ScoreDetail | null>(`/workouts/${id}/score`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
      }
      if (data?.status === "processing")
        throw new Error("採点を継続中です。少し待って再確認してください。");
      if (data?.status === "pending")
        throw new Error("採点が完了しませんでした。再試行してください。");
      update({ data, busy: false });
      if (!controller.signal.aborted) changed.current();
    } catch (reason) {
      update({
        error: reason instanceof Error ? reason.message : "採点を確認できませんでした。",
        busy: false,
      });
    } finally {
      requests.current.delete(id);
    }
  }
  return { results, evaluate };
}
