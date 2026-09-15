import type { Workout } from "@/lib/api";
import { useEffect, useState } from "react";
import type { useResource } from "../training/use-resource";
import { HistoryBrowser } from "./history-browser";

export function History({
  guideTarget,
  userId,
  recent,
  active,
  prefetch = false,
  refreshKey,
  onEdit,
  onReuse,
  onDeleted,
}: {
  guideTarget?: { target: string } | null;
  userId: string;
  recent: ReturnType<typeof useResource<Workout[]>>;
  active: boolean;
  prefetch?: boolean;
  refreshKey: number;
  onEdit: (record: Workout) => void;
  onReuse: (record: Workout) => void;
  onDeleted: () => void;
}) {
  const [tab, setTab] = useState<"calendar" | "graph">("calendar");
  useEffect(() => {
    if (guideTarget?.target === "calendar" || guideTarget?.target === "graph")
      setTab(guideTarget.target);
  }, [guideTarget]);
  return (
    <section className="history-screen">
      <h1>履歴</h1>
      <div className="analytics-tabs" aria-label="履歴の表示">
        <button type="button" aria-pressed={tab === "calendar"} onClick={() => setTab("calendar")}>
          カレンダー
        </button>
        <button
          type="button"
          data-tour="graph"
          aria-pressed={tab === "graph"}
          onClick={() => setTab("graph")}
        >
          グラフ
        </button>
      </div>
      <HistoryBrowser
        userId={userId}
        recent={recent}
        active={active}
        prefetch={prefetch}
        refreshKey={refreshKey}
        tab={tab}
        onEdit={onEdit}
        onReuse={onReuse}
        onDeleted={onDeleted}
      />
    </section>
  );
}
