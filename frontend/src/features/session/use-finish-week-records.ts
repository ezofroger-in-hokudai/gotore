import { type Workout, api } from "@/lib/api";
import { useEffect, useState } from "react";
import { addDays } from "../analytics/period";

export function useFinishWeekRecords(
  active: boolean,
  sessionId: string | null,
  lastDate: string | null,
  finishOpen: boolean,
) {
  const [records, setRecords] = useState<Workout[] | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 終了確認を開くたびに履歴を非同期で再照合する。
  useEffect(() => {
    if (!active || !sessionId || !lastDate) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const collected: Workout[] = [];
        for (let offset = 0; !controller.signal.aborted; offset += 50) {
          const query = new URLSearchParams({
            date_from: addDays(lastDate, -6),
            date_to: lastDate,
            limit: "50",
            offset: String(offset),
          });
          const page = await api<Workout[]>(`/workouts?${query}`, { signal: controller.signal });
          collected.push(...page);
          if (page.length < 50) break;
        }
        if (!controller.signal.aborted) setRecords(collected);
      } catch {
        // 過去の取得失敗で終了操作を止めない。次に開いたとき再取得する。
      }
    };
    void load();
    return () => controller.abort();
  }, [active, sessionId, lastDate, finishOpen]);
  return records;
}
