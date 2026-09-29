"use client";

import { type BodyPart, type MonthlyActivity, type Workout, api } from "@/lib/api";
import { useEffect, useState } from "react";
import { activityForPart } from "../activity/body-parts";
import { dateLabel } from "../activity/calendar";
import { BODY_PART_LABELS } from "../exercises/body-parts";
import { LoadingState } from "../loading/loading-state";
import { StampControl } from "../stamps/stamp-control";
import { today } from "../training/draft";
import { RecordList } from "../training/record-list";
import { ResourceError } from "../training/resource-error";
import { useResource } from "../training/use-resource";
import { GroupHistoryPartTabs } from "./group-history-part-tabs";
import { HistoryCalendar } from "./history-calendar";
import { Sheet } from "./sheet";

export function GroupHistoryCalendar({
  groupId,
  userId,
  active,
  refreshKey,
  part,
  onPartChange,
}: {
  groupId: string;
  userId: string;
  active: boolean;
  refreshKey: number;
  part: BodyPart | "all";
  onPartChange: (part: BodyPart | "all") => void;
}) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState("");
  const [extraRecords, setExtraRecords] = useState<Workout[]>([]);
  const [extraError, setExtraError] = useState("");
  const [extraRetry, setExtraRetry] = useState(0);
  const activity = useResource<MonthlyActivity>(
    `/groups/${groupId}/workouts/activity?month=${month}`,
    refreshKey,
    false,
    true,
    { enabled: active, retainOnRefresh: true },
  );
  const records = useResource<Workout[]>(
    selectedDay ? `/groups/${groupId}/workouts?performed_on=${selectedDay}&limit=50` : null,
    refreshKey,
    false,
    true,
    { enabled: active && !!selectedDay, retainOnRefresh: true },
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: 追加ページの再試行でも同じ日付から取得し直す。
  useEffect(() => {
    setExtraRecords([]);
    setExtraError("");
    if (!selectedDay || records.data?.length !== 50) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        let offset = 50;
        while (!controller.signal.aborted) {
          const page = await api<Workout[]>(
            `/groups/${groupId}/workouts?performed_on=${selectedDay}&limit=50&offset=${offset}`,
            { signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          setExtraRecords((current) => [...current, ...page]);
          if (page.length < 50) return;
          offset += 50;
        }
      } catch {
        if (!controller.signal.aborted) setExtraError("残りの記録を取得できません。再試行");
      }
    };
    void load();
    return () => controller.abort();
  }, [groupId, selectedDay, records.data, extraRetry]);
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
      {selectedDay && (
        <Sheet title={`${dateLabel(selectedDay)}の全メニュー`} onClose={() => setSelectedDay("")}>
          <ResourceError resource={records} />
          {extraError && (
            <button type="button" onClick={() => setExtraRetry((value) => value + 1)}>
              {extraError}
            </button>
          )}
          {records.loading && !records.data && <LoadingState label="記録を読み込み中" compact />}
          {records.data?.length === 0 && <p className="muted">この日の記録はありません</p>}
          {records.data && (
            <RecordList
              records={[...records.data, ...extraRecords]}
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
