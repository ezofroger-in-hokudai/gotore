"use client";

import type { BodyPart } from "@/lib/api";
import { useState } from "react";
import { useAnalytics } from "../analytics/use-analytics";
import { GroupHistoryPartTabs } from "./group-history-part-tabs";
import { HistoryGraph } from "./personal-history";
import { type HistoryGrain, graphPoints } from "./personal-history-model";

type GroupMetric = "volume" | "sets" | "people";

export function GroupHistoryGraph({
  groupId,
  active,
  refreshKey,
  part,
  onPartChange,
}: {
  groupId: string;
  active: boolean;
  refreshKey: number;
  part: BodyPart | "all";
  onPartChange: (part: BodyPart | "all") => void;
}) {
  const [grain, setGrain] = useState<HistoryGrain>("month");
  const [metric, setMetric] = useState<GroupMetric>("volume");
  const graph = useAnalytics(
    `/groups/${groupId}`,
    "all",
    0,
    "",
    active,
    false,
    refreshKey,
    "",
    "",
    part === "all" ? "" : part,
  );
  return (
    <section className="group-history-graph" aria-label="グループの記録の推移">
      <GroupHistoryPartTabs part={part} onChange={onPartChange} />
      <HistoryGraph
        data={graphPoints(graph.data, grain, graph.data?.window.start)}
        showSource={false}
        metric={metric}
        setMetric={(value) => setMetric(value as GroupMetric)}
        grain={grain}
        setGrain={setGrain}
        metrics={["volume", "sets", "people"]}
        loading={graph.loading && !graph.data}
        error={graph.error ?? ""}
        retry={graph.retry}
      />
    </section>
  );
}
