"use client";

import type { BodyPart } from "@/lib/api";
import { useEffect, useState } from "react";
import { activityForPart } from "../activity/body-parts";
import { dateLabel } from "../activity/calendar";
import { BODY_PART_LABELS } from "../exercises/body-parts";
import { LoadingState } from "../loading/loading-state";
import { StampControl } from "../stamps/stamp-control";
import { today } from "../training/draft";
import { RecordList } from "../training/record-list";
import { ResourceError } from "../training/resource-error";
import type { GroupHistoryCache } from "./group-history-cache";
import { GroupHistoryPartTabs } from "./group-history-part-tabs";
import { HistoryCalendar } from "./history-calendar";
import { Sheet } from "./sheet";
import { useGroupHistoryResource } from "./use-group-history-resource";

export function GroupHistoryCalendar({
  groupId,
  cache,
  userId,
  active,
  refreshKey,
  part,
  onPartChange,
}: {
  groupId: string;
  cache: GroupHistoryCache;
  userId: string;
  active: boolean;
  refreshKey: number;
  part: BodyPart | "all";
  onPartChange: (part: BodyPart | "all") => void;
}) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState("");
  const activity = useGroupHistoryResource(
    cache.activity,
    `/groups/${groupId}/workouts/activity?month=${month}`,
    active,
    refreshKey,
  );
  const records = useGroupHistoryResource(
    cache.days,
    selectedDay ? `/groups/${groupId}/workouts?performed_on=${selectedDay}&limit=50` : null,
    active && !!selectedDay,
    refreshKey,
  );
  useEffect(() => {
    if (!active) setSelectedDay("");
  }, [active]);
  const monthlyActivity = activity.data?.month === month ? activity.data : null;
  const hasParts = !monthlyActivity?.days.some(
    (day) =>
      !day.body_parts ||
      day.body_parts.some((entry) => !entry.body_part || entry.body_part === "full_body"),
  );
  const filtered =
    monthlyActivity && part !== "all" && hasParts
      ? activityForPart(monthlyActivity, part)
      : monthlyActivity;
  const label = part === "all" ? "全種目" : `${BODY_PART_LABELS[part]}全体`;

  return (
    <section className="group-history-calendar" aria-label="グループの活動カレンダー">
      <GroupHistoryPartTabs part={part} onChange={onPartChange} disabled={!hasParts} />
      <HistoryCalendar
        month={month}
        activity={filtered}
        current={today()}
        oldestMonth="2000-01"
        scopeLabel={label}
        onMonthChange={(next) => {
          setMonth(next);
          setSelectedDay("");
        }}
        onSelectDay={setSelectedDay}
      >
        <ResourceError resource={activity} />
      </HistoryCalendar>
      {active && selectedDay && (
        <Sheet title={`${dateLabel(selectedDay)}の全メニュー`} onClose={() => setSelectedDay("")}>
          <ResourceError resource={records} />
          {records.loading && !records.data && <LoadingState label="記録を読み込み中" compact />}
          {records.data?.length === 0 && <p className="muted">この日の記録はありません</p>}
          {records.data && (
            <RecordList
              records={records.data}
              userId={userId}
              empty=""
              compact
              timeOnly
              headerControl={(record) => (
                <StampControl
                  active={active}
                  key={`${groupId}:${record.id}`}
                  groupId={groupId}
                  workoutId={record.id}
                  name={record.display_name}
                />
              )}
            />
          )}
        </Sheet>
      )}
    </section>
  );
}
