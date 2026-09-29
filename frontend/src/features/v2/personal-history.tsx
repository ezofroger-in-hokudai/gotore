"use client";

import {
  type BodyPart,
  type HistorySummary,
  type MonthlyActivity,
  type Workout,
  api,
} from "@/lib/api";
import { useEffect, useId, useRef, useState } from "react";
import { activityForPart } from "../activity/body-parts";
import { dateLabel, shiftMonth } from "../activity/calendar";
import { number } from "../analytics/chart";
import type { Metric, Point } from "../analytics/types";
import { useAnalytics } from "../analytics/use-analytics";
import { BODY_PART_LABELS, PART_FILTERS } from "../exercises/body-parts";
import { LoadingState } from "../loading/loading-state";
import { today } from "../training/draft";
import { RecordList } from "../training/record-list";
import { ResourceError } from "../training/resource-error";
import { useResource } from "../training/use-resource";
import { HistoryCalendar } from "./history-calendar";
import {
  type HistoryGrain,
  type HistoryScope,
  graphPoints,
  recentExercises,
  recentPartAges,
  smoothGraphPath,
} from "./personal-history-model";
import { Sheet } from "./sheet";

type Tab = "calendar" | "graph" | "body";
type HistoryMetric = Extract<Metric, "volume" | "weight" | "rm" | "sets" | "people">;
const graphMetricLabels: Record<HistoryMetric, string> = {
  volume: "総負荷",
  weight: "最大重量",
  rm: "最大推定1RM",
  sets: "セット数",
  people: "活動人数",
};
const graphMetricUnits: Record<HistoryMetric, string> = {
  volume: "kg",
  weight: "kg",
  rm: "kg",
  sets: "セット",
  people: "人",
};
const format = (value: number | null | undefined) => number(value);
const dateMonth = (value: string) => `${Number(value.slice(0, 4))}年${Number(value.slice(5, 7))}月`;

export function PersonalHistory({
  guideTarget,
  userId,
  active,
  prefetch,
  refreshKey,
  onEdit,
  onReuse,
  onDeleted,
}: {
  guideTarget?: { target: string } | null;
  userId: string;
  active: boolean;
  prefetch: boolean;
  refreshKey: number;
  onEdit: (record: Workout) => void;
  onReuse: (record: Workout) => void;
  onDeleted: () => void;
}) {
  const current = today();
  const [tab, setTab] = useState<Tab>(guideTarget?.target === "graph" ? "graph" : "calendar");
  const [scope, setScope] = useState<HistoryScope>({ part: "all", exercise: "" });
  const [month, setMonth] = useState(current.slice(0, 7));
  const [grain, setGrain] = useState<HistoryGrain>("month");
  const [metric, setMetric] = useState<HistoryMetric>("volume");
  const [selectedDay, setSelectedDay] = useState("");
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [pickerPart, setPickerPart] = useState<BodyPart | "all">("all");
  const [extraDayRecords, setExtraDayRecords] = useState<Workout[]>([]);
  const [extraDayError, setExtraDayError] = useState("");
  const [extraDayRetry, setExtraDayRetry] = useState(0);
  useEffect(() => {
    if (guideTarget?.target === "graph") setTab("graph");
    if (guideTarget?.target === "calendar") setTab("calendar");
  }, [guideTarget?.target]);
  const summary = useResource<HistorySummary>("/history/summary", refreshKey, false, true, {
    enabled: active,
    prefetch,
    retainOnRefresh: true,
  });
  const monthQuery = new URLSearchParams({ month });
  if (scope.exercise) monthQuery.set("exercise", scope.exercise);
  const activity = useResource<MonthlyActivity>(
    `/workouts/activity?${monthQuery}`,
    refreshKey,
    false,
    true,
    {
      enabled: active && tab === "calendar",
      retainOnRefresh: true,
    },
  );
  const currentActivity = useResource<MonthlyActivity>(
    `/workouts/activity?month=${current.slice(0, 7)}`,
    refreshKey,
    false,
    true,
    { enabled: active && tab === "body", retainOnRefresh: true },
  );
  const previousActivity = useResource<MonthlyActivity>(
    `/workouts/activity?month=${shiftMonth(current.slice(0, 7), -1)}`,
    refreshKey,
    false,
    true,
    {
      enabled: active && tab === "body" && Number(current.slice(-2)) <= 3,
      retainOnRefresh: true,
    },
  );
  const graph = useAnalytics(
    "",
    "all",
    0,
    scope.exercise,
    active && tab === "graph",
    false,
    refreshKey,
    "",
    "",
    scope.exercise ? "" : scope.part === "all" ? "" : scope.part,
  );
  const dayRecords = useResource<Workout[]>(
    selectedDay ? `/workouts?performed_on=${selectedDay}&limit=50` : null,
    refreshKey,
    false,
    true,
    { enabled: active && !!selectedDay, retainOnRefresh: true },
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: 残りのページの再試行時にも同じ日付から取得し直す。
  useEffect(() => {
    setExtraDayRecords([]);
    setExtraDayError("");
    if (!selectedDay || dayRecords.data?.length !== 50) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        let offset = 50;
        while (!controller.signal.aborted) {
          const page = await api<Workout[]>(
            `/workouts?performed_on=${selectedDay}&limit=50&offset=${offset}`,
            { signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          setExtraDayRecords((current) => [...current, ...page]);
          if (page.length < 50) return;
          offset += 50;
        }
      } catch {
        if (!controller.signal.aborted) setExtraDayError("残りの記録を取得できません。再試行");
      }
    };
    void load();
    return () => controller.abort();
  }, [selectedDay, dayRecords.data, extraDayRetry]);
  const monthlyActivity = activity.data?.month === month ? activity.data : null;
  const filteredActivity =
    monthlyActivity && scope.part !== "all" && !scope.exercise
      ? activityForPart(monthlyActivity, scope.part)
      : monthlyActivity;
  const exercises = recentExercises(summary.data ?? undefined, scope.part);
  const oldest = summary.data?.first_performed_on;
  const graphData = graphPoints(graph.data, grain, oldest);
  const exerciseRail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scope) return;
    exerciseRail.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [scope]);

  function choosePart(part: BodyPart | "all") {
    setScope({ part, exercise: "" });
  }

  function chooseExercise(name: string) {
    const item = summary.data?.exercises.find((entry) => entry.name === name);
    setScope({ part: item?.body_part ?? "all", exercise: name });
    setPicker(false);
  }

  const bodyAges = recentPartAges(
    [...(previousActivity.data?.days ?? []), ...(currentActivity.data?.days ?? [])],
    current,
  );
  const scopeLabel =
    scope.exercise || (scope.part === "all" ? "全種目" : `${BODY_PART_LABELS[scope.part]}全体`);
  const pickerExercises = recentExercises(summary.data ?? undefined, pickerPart).filter((item) =>
    item.name.includes(search.trim()),
  );

  return (
    <section className="personal-history" aria-label="個人の履歴">
      <div className="personal-history-summary" aria-label="これまでの記録">
        <div>
          <small>総負荷</small>
          <strong>
            {format(summary.data?.total_volume)}
            <small>kg</small>
          </strong>
        </div>
        <div>
          <strong>{format(summary.data?.workout_count)}回</strong>
          <small>トレーニング</small>
        </div>
        <div>
          <strong>{format(summary.data?.total_sets)}</strong>
          <small>セット</small>
        </div>
      </div>
      <div className="personal-history-part-tabs" aria-label="部位で絞り込み">
        {PART_FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={scope.part === item.value}
            onClick={() => choosePart(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        ref={exerciseRail}
        className="personal-history-exercise-rail"
        aria-label="種目で絞り込み"
      >
        <button type="button" aria-pressed={!scope.exercise} onClick={() => choosePart(scope.part)}>
          {scope.part === "all" ? "全種目" : `${BODY_PART_LABELS[scope.part]}全体`}
        </button>
        {exercises.map((item) => (
          <button
            type="button"
            key={item.name}
            aria-pressed={scope.exercise === item.name}
            onClick={() => chooseExercise(item.name)}
          >
            {item.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setPickerPart(scope.part);
            setPicker(true);
          }}
        >
          探す
        </button>
      </div>
      <div className="personal-history-tabs" role="tablist" aria-label="履歴の表示">
        {(["calendar", "graph", "body"] as const).map((value) => (
          <button
            type="button"
            key={value}
            role="tab"
            id={`personal-history-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`personal-history-panel-${value}`}
            data-tour={value === "graph" ? "graph" : value === "calendar" ? "calendar" : undefined}
            onClick={() => setTab(value)}
          >
            {{ calendar: "カレンダー", graph: "グラフ", body: "使った部位" }[value]}
          </button>
        ))}
      </div>
      <div
        className="personal-history-panel"
        role="tabpanel"
        id={`personal-history-panel-${tab}`}
        aria-labelledby={`personal-history-tab-${tab}`}
      >
        {tab === "calendar" && (
          <HistoryCalendar
            month={month}
            activity={filteredActivity}
            current={current}
            oldestMonth={oldest?.slice(0, 7) ?? current.slice(0, 7)}
            scopeLabel={scopeLabel}
            onMonthChange={setMonth}
            onSelectDay={setSelectedDay}
          >
            <ResourceError resource={activity} />
          </HistoryCalendar>
        )}
        {tab === "graph" && (
          <HistoryGraph
            data={graphData}
            showSource={!scope.exercise}
            metric={metric}
            setMetric={(value) => setMetric(value as HistoryMetric)}
            grain={grain}
            setGrain={setGrain}
            metrics={["volume", "weight", "rm"]}
            loading={graph.loading && !graph.data}
            error={graph.error ?? ""}
            retry={graph.retry}
          />
        )}
        {tab === "body" && (
          <HistoryBody ages={bodyAges} loading={!currentActivity.data && currentActivity.loading} />
        )}
      </div>
      {picker && (
        <Sheet title="種目を選ぶ" onClose={() => setPicker(false)}>
          <div className="personal-history-picker">
            <input
              type="search"
              placeholder="種目名で検索"
              aria-label="種目名で検索"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="personal-history-picker-parts" aria-label="部位で絞り込み">
              {PART_FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={pickerPart === item.value}
                  onClick={() => setPickerPart(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="personal-history-picker-row"
              onClick={() => {
                choosePart(pickerPart);
                setPicker(false);
              }}
            >
              {pickerPart === "all" ? "全種目" : `${BODY_PART_LABELS[pickerPart]}全体`}
            </button>
            {pickerExercises.map((item) => (
              <button
                type="button"
                className="personal-history-picker-row"
                key={item.name}
                onClick={() => chooseExercise(item.name)}
              >
                <b>{item.name}</b>
                <small>{BODY_PART_LABELS[item.body_part]}</small>
              </button>
            ))}
            {!pickerExercises.length && <p>該当する種目はありません</p>}
          </div>
        </Sheet>
      )}
      {selectedDay && (
        <Sheet title={`${dateLabel(selectedDay)}の全メニュー`} onClose={() => setSelectedDay("")}>
          <ResourceError resource={dayRecords} />
          {extraDayError && (
            <button type="button" onClick={() => setExtraDayRetry((current) => current + 1)}>
              {extraDayError}
            </button>
          )}
          {dayRecords.loading && !dayRecords.data && (
            <LoadingState label="記録を読み込み中" compact />
          )}
          {dayRecords.data?.length === 0 && <p className="muted">この日の記録はありません</p>}
          {dayRecords.data && (
            <RecordList
              records={[...dayRecords.data, ...extraDayRecords]}
              userId={userId}
              personal
              compact
              timeOnly
              empty=""
              onEdit={(record) => {
                setSelectedDay("");
                onEdit(record);
              }}
              onReuse={onReuse}
              onDeleted={() => {
                setSelectedDay("");
                onDeleted();
              }}
            />
          )}
        </Sheet>
      )}
      {summary.error && !summary.data && (
        <button className="personal-history-retry" type="button" onClick={summary.retry}>
          集計を取得できません。再試行
        </button>
      )}
    </section>
  );
}

export function HistoryGraph({
  data,
  showSource,
  metric,
  setMetric,
  grain,
  setGrain,
  metrics,
  loading,
  error,
  retry,
}: {
  data: Point[];
  showSource: boolean;
  metric: HistoryMetric;
  setMetric: (value: HistoryMetric) => void;
  grain: HistoryGrain;
  setGrain: (value: HistoryGrain) => void;
  metrics: HistoryMetric[];
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const scrollIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillId = useId().replaceAll(":", "");
  const pointGap = grain === "all" ? 24 : 64;
  const plotWidth = Math.max(
    grain === "all" ? 280 : 320,
    48 + Math.max(0, data.length - 1) * pointGap,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: 指標・期間・データ点数が変わると表示を最新位置へ戻す。
  useEffect(() => {
    setSelectedPoint(null);
    const frame = requestAnimationFrame(() => {
      const viewport = scrollRef.current;
      if (viewport) viewport.scrollLeft = viewport.scrollWidth - viewport.clientWidth;
    });
    return () => cancelAnimationFrame(frame);
  }, [grain, metric, data.length]);
  useEffect(
    () => () => {
      if (scrollIdle.current) clearTimeout(scrollIdle.current);
    },
    [],
  );
  const index =
    selectedPoint == null ? Math.max(0, data.length - 1) : Math.min(selectedPoint, data.length - 1);
  const selected = data[index];
  const periodStart = data[grain === "all" ? 0 : Math.max(0, index - 5)];
  const periodEnd = data[grain === "all" ? data.length - 1 : index];
  const values = data
    .map((point) => point[metric])
    .filter((value): value is number => value != null);
  const minimum =
    metric === "volume" || metric === "sets" || metric === "people" || !values.length
      ? 0
      : Math.max(0, Math.min(...values) - 10);
  const maximum = Math.max(1, ...values);
  const y = (value: number) => 111 - ((value - minimum) / Math.max(1, maximum - minimum)) * 84;
  const x = (point: number) => 24 + point * pointGap;
  const coordinates = data.flatMap((point, pointIndex): [number, number][] =>
    point[metric] == null ? [] : [[x(pointIndex), y(point[metric])]],
  );
  const line = smoothGraphPath(coordinates);
  const area = coordinates.length
    ? `${line} L${coordinates.at(-1)?.[0]} 111 L${coordinates[0][0]} 111 Z`
    : "";
  const verticalGrid = data.map((_, pointIndex) => `M${x(pointIndex)} 22V111`).join(" ");
  return (
    <div className="personal-history-card personal-history-graph">
      <div className="personal-history-metric-tabs" aria-label="グラフの指標">
        {metrics.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={metric === value}
            onClick={() => setMetric(value)}
          >
            {graphMetricLabels[value]}
          </button>
        ))}
      </div>
      <small className="personal-history-graph-period">
        {periodStart && periodEnd
          ? `${dateMonth(periodStart.start)}–${dateMonth(periodEnd.start)}`
          : ""}
      </small>
      <div className="personal-history-graph-value">
        <strong>
          {format(selected?.[metric])}
          <small>{graphMetricUnits[metric]}</small>
        </strong>
        <span>
          {selected
            ? grain === "week"
              ? `${selected.start.slice(5).replace("-", "/")}の週`
              : dateMonth(selected.start)
            : ""}
          {showSource &&
            (metric === "weight" || metric === "rm") &&
            selected?.[`${metric}_exercise`] &&
            ` · ${selected[`${metric}_exercise`]}`}
        </span>
      </div>
      <div className="personal-history-grain-row">
        <span>期間</span>
        <div aria-label="グラフの集計期間">
          {(["week", "month", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={grain === value}
              onClick={() => setGrain(value)}
            >
              {{ week: "週", month: "月", all: "全期間" }[value]}
            </button>
          ))}
        </div>
      </div>
      {error && !data.length ? (
        <button type="button" className="personal-history-retry" onClick={retry}>
          グラフを取得できません。再試行
        </button>
      ) : loading ? (
        <div className="personal-history-chart-empty" aria-hidden="true" />
      ) : !data.length ? (
        <p className="personal-history-chart-empty">まだ記録がありません</p>
      ) : (
        <>
          <div
            className="personal-history-plot-scroll"
            ref={scrollRef}
            aria-label="横にスワイプして過去の記録を見る"
            onPointerDown={(event) => {
              if (event.pointerType !== "mouse") return;
              drag.current = {
                x: event.clientX,
                left: event.currentTarget.scrollLeft,
                moved: false,
              };
            }}
            onPointerMove={(event) => {
              if (!drag.current || event.buttons !== 1) return;
              const distance = event.clientX - drag.current.x;
              if (Math.abs(distance) > 3) drag.current.moved = true;
              event.currentTarget.scrollLeft = drag.current.left - distance;
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerLeave={() => {
              drag.current = null;
            }}
            onScroll={(event) => {
              const viewport = event.currentTarget;
              if (scrollIdle.current) clearTimeout(scrollIdle.current);
              scrollIdle.current = setTimeout(() => {
                const visibleIndex = Math.min(
                  data.length - 1,
                  Math.max(
                    0,
                    Math.round((viewport.scrollLeft + viewport.clientWidth - 24) / pointGap),
                  ),
                );
                setSelectedPoint(visibleIndex);
              }, 180);
            }}
          >
            <div className="personal-history-plot-track" style={{ width: plotWidth }}>
              <div className="personal-history-plot">
                <svg
                  viewBox={`0 0 ${plotWidth} 132`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`${graphMetricLabels[metric]}の推移`}
                >
                  <defs>
                    <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
                      <stop stopColor="var(--accent)" stopOpacity=".24" />
                      <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d={`M18 111H${plotWidth - 12}M18 67H${plotWidth - 12}M18 22H${plotWidth - 12}`}
                    fill="none"
                    stroke="var(--line)"
                  />
                  <path d={verticalGrid} fill="none" stroke="var(--line)" opacity=".55" />
                  {area && <path d={area} fill={`url(#${fillId})`} />}
                  {line && (
                    <path
                      className="personal-history-trend"
                      d={line}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2.5"
                    />
                  )}
                </svg>
                {data.map((point, pointIndex) =>
                  point[metric] == null ? null : (
                    <button
                      key={point.start}
                      type="button"
                      aria-label={`${point.start}、${graphMetricLabels[metric]}${format(point[metric])}${graphMetricUnits[metric]}`}
                      aria-pressed={index === pointIndex}
                      style={{
                        left: `${(x(pointIndex) / plotWidth) * 100}%`,
                        top: `${(y(point[metric]) / 132) * 100}%`,
                      }}
                      onClick={() => {
                        if (!drag.current?.moved) setSelectedPoint(pointIndex);
                      }}
                    />
                  ),
                )}
              </div>
              <div
                className="personal-history-graph-labels"
                style={{ gridTemplateColumns: `repeat(${data.length},${pointGap}px)` }}
              >
                {data.map((point) => (
                  <span key={point.start}>
                    {grain === "week"
                      ? point.start.slice(5).replace("-", "/")
                      : `${Number(point.start.slice(5, 7))}月`}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function mirrorPolygon(mask: string, axis: number) {
  return mask.replace(
    /(\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%/g,
    (_, x: string, y: string) => `${2 * axis - Number(x)}% ${y}%`,
  );
}

const frontShoulder =
  "polygon(10% 18%, 16% 16%, 20% 19%, 21% 22%, 19% 25%, 14% 25%, 10% 23%, 8% 21%)";
const backShoulder =
  "polygon(57% 20%, 61% 17%, 65% 17%, 69% 20%, 68% 23%, 65% 25%, 60% 25%, 57% 23%)";
const frontChest =
  "polygon(20% 20%, 23% 19%, 27% 21%, 27% 27%, 24% 30%, 21% 29%, 19% 26%, 19% 22%)";
const frontArm = "polygon(9% 23.5%, 17% 25.5%, 12% 45%, 9% 48%, 4% 48%, 5% 37%)";
const backArm = "polygon(56% 23.5%, 64% 25.5%, 60% 45%, 57% 48%, 51% 48%)";
const frontLeg = "polygon(16% 47%, 27% 48%, 28% 63%, 25% 89%, 17% 91%, 12% 67%)";
const backLeg = "polygon(63% 51%, 68% 52%, 73% 51%, 75% 63%, 71% 91%, 63% 90%, 60% 67%)";

const bodyRegions: { part: BodyPart; mask: string }[] = [
  { part: "chest", mask: frontChest },
  { part: "chest", mask: mirrorPolygon(frontChest, 27) },
  {
    part: "back",
    mask: "polygon(66.75% 19%, 70.75% 18%, 75.75% 18%, 79.75% 19%, 82.25% 23%, 82.25% 31%, 79.75% 39%, 76.75% 42%, 69.75% 42%, 66.75% 39%, 64.25% 31%, 64.25% 23%)",
  },
  { part: "shoulders", mask: frontShoulder },
  { part: "shoulders", mask: mirrorPolygon(frontShoulder, 27) },
  { part: "shoulders", mask: backShoulder },
  { part: "shoulders", mask: mirrorPolygon(backShoulder, 74.5) },
  { part: "arms", mask: frontArm },
  { part: "arms", mask: mirrorPolygon(frontArm, 27) },
  { part: "arms", mask: backArm },
  { part: "arms", mask: mirrorPolygon(backArm, 74.5) },
  {
    part: "abs",
    mask: "polygon(22% 30%, 32% 30%, 34% 33%, 33% 40%, 30% 44%, 24% 44%, 21% 40%, 20% 33%)",
  },
  { part: "legs", mask: frontLeg },
  { part: "legs", mask: mirrorPolygon(frontLeg, 27.5) },
  { part: "legs", mask: backLeg },
  { part: "legs", mask: mirrorPolygon(backLeg, 74.5) },
  { part: "glutes", mask: "ellipse(7% 7% at 70% 45%)" },
  { part: "glutes", mask: "ellipse(7% 7% at 79% 45%)" },
];

function HistoryBody({
  ages,
  loading,
}: {
  ages: Partial<Record<BodyPart, number>>;
  loading: boolean;
}) {
  const source = "/previews/history-body-realistic-heatmap.png";
  const used = PART_FILTERS.slice(1)
    .map((item) => item.value as BodyPart)
    .filter((part) => ages[part] !== undefined);
  return (
    <div className="personal-history-card personal-history-body">
      <span className="personal-history-body-period">直近3日</span>
      <div className="personal-history-body-art">
        <div className="personal-history-body-image">
          <img
            src={source}
            alt="前面と背面の人体図。最近使った部位を赤く表示"
            className="personal-history-body-base"
          />
          {bodyRegions.map((region, index) =>
            ages[region.part] === undefined ? null : (
              <img
                key={`${region.part}-${index}`}
                src={source}
                alt=""
                aria-hidden="true"
                className="personal-history-body-region"
                data-part={region.part}
                data-age={ages[region.part]}
                style={{ clipPath: region.mask }}
              />
            ),
          )}
        </div>
      </div>
      <div className="personal-history-body-legend">
        <span>今日</span>
        <i />
        <span>3日前</span>
      </div>
      <div className="personal-history-body-tags">
        {used.map((part) => (
          <span key={part} data-age={ages[part]}>
            {BODY_PART_LABELS[part]}{" "}
            <small>{ages[part] === 0 ? "今日" : `${ages[part]}日前`}</small>
          </span>
        ))}
        {!used.length && !loading && <span>最近の記録はありません</span>}
      </div>
    </div>
  );
}
