import type { Workout } from "@/lib/api";
import { useCallback, useState } from "react";
import { ActivityCalendar } from "../activity/activity-calendar";
import { dates, number } from "../analytics/chart";
import { AnalyticsPanel } from "../analytics/panel";
import { LoadingState } from "../loading/loading-state";
import { StampControl } from "../stamps/stamp-control";
import { BestFlame } from "../training/best-flame";
import { today } from "../training/draft";
import { RecordList } from "../training/record-list";
import { recordSummary } from "../training/record-summary";
import { ResourceError } from "../training/resource-error";
import { useResource } from "../training/use-resource";

type Range = { start: string; end: string; exercise: string; member: string };
export function HistoryBrowser({
  scope = "",
  userId,
  active,
  prefetch = false,
  refreshKey,
  tab,
  recent,
  members = [],
  onEdit,
  onReuse,
  onDeleted = () => {},
}: {
  scope?: string;
  userId: string;
  active: boolean;
  prefetch?: boolean;
  refreshKey: number;
  tab: "calendar" | "graph" | "ranking";
  recent?: ReturnType<typeof useResource<Workout[]>>;
  members?: { id: string; display_name: string }[];
  onEdit?: (record: Workout) => void;
  onReuse?: (record: Workout) => void;
  onDeleted?: () => void;
}) {
  const [anchor, setAnchor] = useState(today);
  const [date, setDate] = useState("");
  const [range, setRange] = useState<Range | null>(null);
  const [graphReady, setGraphReady] = useState(false);
  const [calendarPage, setCalendarPage] = useState(0);
  const [graphPage, setGraphPage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const selectRange = useCallback(
    (start: string, end: string, exercise: string, member: string) => {
      setRange((old) =>
        old?.start === start &&
        old.end === end &&
        old.exercise === exercise &&
        old.member === member
          ? old
          : { start, end, exercise, member },
      );
      setGraphPage(0);
    },
    [],
  );
  const graph = tab !== "calendar";
  const page = graph ? graphPage : calendarPage;
  const setPage = graph ? setGraphPage : setCalendarPage;
  const query = new URLSearchParams({ offset: String(page * 50), limit: "50" });
  if (!graph && date) query.set("performed_on", date);
  if (graph && range) {
    query.set("date_from", range.start);
    query.set("date_to", range.end);
    if (range.exercise) query.set("exercise", range.exercise);
    if (range.member) query.set("member_id", range.member);
  }
  const useRecent = !scope && !graph && !date && page === 0 && !!recent;
  const filtered = useResource<Workout[]>(
    `${scope}/workouts?${query}`,
    refreshKey,
    Boolean(scope) && active,
    true,
    {
      enabled: active && !useRecent && tab !== "ranking" && (!graph || !!range),
      retainOnRefresh: true,
    },
  );
  const records = useRecent ? recent : filtered;
  const current = records.data?.find((r) => r.id === detail);
  const compact = !graph && !date && page === 0 && !expanded;
  const changeAnchor = (value: string) => {
    setGraphReady(false);
    setAnchor(value);
    setCalendarPage(0);
    setGraphPage(0);
    setDate("");
    setPage(0);
    setDetail(null);
  };
  return (
    <>
      {current && (
        <section className="history-detail">
          <button type="button" className="text-button" onClick={() => setDetail(null)}>
            ‹ 履歴
          </button>
          <ResourceError resource={records} />
          {scope && (
            <StampControl
              active={active}
              key={`${scope}:${current.id}`}
              groupId={scope.split("/").at(-1) || ""}
              workoutId={current.id}
              name={current.display_name}
              alwaysVisible
            />
          )}
          <RecordList
            records={[current]}
            userId={userId}
            empty=""
            personal={!scope}
            onEdit={onEdit}
            onReuse={onReuse}
            onDeleted={() => {
              setDetail(null);
              onDeleted();
            }}
          />
        </section>
      )}
      <div hidden={!!current}>
        <div hidden={tab !== "calendar"}>
          <ActivityCalendar
            scope={scope}
            month={anchor.slice(0, 7)}
            onMonthChange={(month) => changeAnchor(`${month}-01`)}
            selectedDate={date}
            onSelect={(value) => {
              setDate(value);
              setPage(0);
              setExpanded(false);
            }}
            refreshKey={refreshKey}
            active={active && tab === "calendar"}
            prefetch={prefetch}
          />
        </div>
        <div hidden={!graph}>
          <AnalyticsPanel
            scope={scope}
            members={members}
            anchor={anchor}
            onAnchorChange={changeAnchor}
            ranking={tab === "ranking"}
            active={active && graph}
            prefetch={prefetch}
            refreshKey={refreshKey}
            onRecords={selectRange}
            onRecordsReady={setGraphReady}
          />
        </div>
        <section
          hidden={tab === "ranking" || (graph && !graphReady)}
          className="history-period-records"
          aria-label="選択期間の記録"
        >
          <div className="section-heading">
            <h2>
              {graph && range
                ? dates(range.start, range.end)
                : date
                  ? dates(date, date)
                  : "最近の記録"}
            </h2>
            {!graph && date && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setDate("");
                  setPage(0);
                }}
              >
                すべての記録
              </button>
            )}
          </div>
          <ResourceError resource={records} />
          {!records.data && records.loading && !records.error && (
            <LoadingState label="記録一覧を読み込み中" />
          )}
          <div className="v2-rows">
            {(compact ? records.data?.slice(0, 3) : records.data)?.map((record) => (
              <button
                type="button"
                className="v2-row history-row"
                key={record.id}
                onClick={() => setDetail(record.id)}
              >
                <div>
                  <strong>
                    {record.performed_on.replaceAll("-", "/")}
                    {scope ? ` · ${record.display_name}` : ""}
                    {record.started_at && !record.ended_at ? " · トレーニング中" : ""}
                  </strong>
                  <p>{record.exercises.map((e) => e.name).join(" / ")}</p>
                  <small className="muted">{number(recordSummary(record).volume)} kg</small>
                </div>
                <span className="history-best-meta">
                  {!!record.best_sets?.length && <BestFlame />}
                  {record.exercises.reduce((n, e) => n + e.sets.length, 0)} SETS ›
                </span>
              </button>
            ))}
          </div>
          {records.data?.length === 0 && <p className="muted">この期間は記録がありません</p>}
          {compact && (records.data?.length ?? 0) > 3 && (
            <button type="button" className="secondary full" onClick={() => setExpanded(true)}>
              もっと見る
            </button>
          )}
          {!compact && (page > 0 || records.data?.length === 50) && (
            <div className="pagination">
              <button
                type="button"
                className="secondary"
                disabled={!page || records.loading}
                onClick={() => setPage(page - 1)}
              >
                新しい記録
              </button>
              <span>{page + 1}ページ</span>
              <button
                type="button"
                className="secondary"
                disabled={records.data?.length !== 50 || records.loading}
                onClick={() => setPage(page + 1)}
              >
                以前の記録
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
