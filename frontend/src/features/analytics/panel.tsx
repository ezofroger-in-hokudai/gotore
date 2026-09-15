import { useCallback, useEffect, useState } from "react";
import { LoadingState } from "../loading/loading-state";
import { ResourceError } from "../training/resource-error";
import { AnalyticsChart, dates, number } from "./chart";
import { type Grain, type Metric, type Period, type RankMetric, labels, units } from "./types";
import { useAnalytics } from "./use-analytics";

import { today } from "../training/draft";
import { frameEnd, framePoints, periodGrains, shiftAnchor } from "./period";
import { PeriodPicker } from "./period-picker";
import { usePeriodSwipe } from "./use-period-swipe";

const periods: Record<Period, string> = {
  week: "1週間",
  month: "1か月",
  quarter: "3か月",
  year: "1年",
  all: "全期間",
};
const grains: Record<Grain, string> = { day: "日別", week: "週別", month: "月別" };

export function AnalyticsPanel({
  scope = "",
  active,
  prefetch = false,
  refreshKey,
  ranking = false,
  onRecords,
  onRecordsReady,
  anchor = today(),
  onAnchorChange,
  members = [],
}: {
  scope?: string;
  active: boolean;
  prefetch?: boolean;
  refreshKey: number;
  ranking?: boolean;
  onRecordsReady?: (ready: boolean) => void;
  onRecords?: (start: string, end: string, exercise: string, member: string) => void;
  anchor?: string;
  onAnchorChange?: (value: string) => void;
  members?: { id: string; display_name: string }[];
}) {
  const [period, setPeriod] = useState<Period>("month");
  const offset = 0;
  const [member, setMember] = useState("");
  const selectedMember = !ranking && members.some((m) => m.id === member) ? member : "";
  const [exercise, setExercise] = useState("");
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [metric, setMetric] = useState<Metric>("volume");
  const [rankMetric, setRankMetric] = useState<RankMetric>("volume");
  const [grain, setGrain] = useState<Grain>("day");
  const resource = useAnalytics(
    scope,
    period,
    offset,
    exercise,
    active,
    prefetch,
    refreshKey,
    anchor,
    selectedMember,
  );
  const data = resource.data;
  useEffect(() => {
    onRecordsReady?.(!!data);
  }, [data, onRecordsReady]);
  useEffect(() => {
    if (data) setExerciseNames(data.exercises);
    else if (resource.error) setExerciseNames([]);
  }, [data, resource.error]);
  const metrics: Metric[] = scope
    ? [
        "volume",
        "sets",
        "days",
        "people",
        ...(exercise && selectedMember ? (["weight", "rm"] as const) : []),
      ]
    : ["volume", "sets", "days", ...(exercise ? (["weight", "rm"] as const) : [])];
  const selectedMetric = metrics.includes(metric) ? metric : "volume";
  const rankMetrics: RankMetric[] = [
    "volume",
    "sets",
    "days",
    ...(exercise ? (["weight", "rm"] as const) : []),
    ...(exercise && period !== "all"
      ? (["weight_growth", "weight_percent", "rm_growth", "rm_percent"] as const)
      : []),
  ];
  const selectedRank = rankMetrics.includes(rankMetric) ? rankMetric : "volume";
  const availableGrains = periodGrains(
    period,
    selectedMetric,
    Object.keys(data?.series ?? {}) as Grain[],
  );
  const selectedGrain = availableGrains.includes(grain) ? grain : (availableGrains[0] ?? "month");
  const selected = ranking ? selectedRank : selectedMetric;
  const entries = data?.rankings[selectedRank] ?? [];
  const selectRecords = useCallback(
    (start: string, end: string) => onRecords?.(start, end, exercise, selectedMember),
    [onRecords, exercise, selectedMember],
  );
  const move = (direction: number) => {
    if (period === "all") return;
    const next = shiftAnchor(anchor, period, direction);
    if (
      next < "2000-01-01" ||
      next.slice(0, period === "week" ? 10 : 7) > today().slice(0, period === "week" ? 10 : 7)
    )
      return;
    onAnchorChange?.(next > today() ? today() : next);
  };
  const swipe = usePeriodSwipe(move);
  return (
    <section className="analytics-panel" aria-label={scope ? "グループ集計" : "履歴グラフ"}>
      <PeriodPicker anchor={anchor} period={period} onChange={(value) => onAnchorChange?.(value)} />
      <div className="analytics-controls">
        <label>
          種目
          <select value={exercise} onChange={(event) => setExercise(event.target.value)}>
            <option value="">全種目</option>
            {exercise && !exerciseNames.includes(exercise) && (
              <option value={exercise}>{exercise}</option>
            )}
            {exerciseNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {scope && !ranking && (
          <label className="analytics-member">
            メンバー
            <select value={selectedMember} onChange={(event) => setMember(event.target.value)}>
              <option value="">全員</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          期間
          <select
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value as Period);
              setGrain("day");
            }}
          >
            {(["week", "month", "quarter", "year", "all"] as const).map((value) => (
              <option key={value} value={value}>
                {periods[value]}
              </option>
            ))}
          </select>
        </label>
        {!ranking && !(period === "week" && selectedMetric === "days") && (
          <div className="analytics-grains" aria-label="グラフの集計単位">
            {availableGrains.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={selectedGrain === value}
                onClick={() => setGrain(value)}
              >
                {grains[value]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="analytics-period">
        <span>
          {data ? (
            dates(data.window.start, frameEnd(data.window.end, period))
          ) : (
            <LoadingState label="期間を読み込み中" compact />
          )}
          {data && data.window.end < frameEnd(data.window.end, period)
            ? ` · ${data.window.end.slice(5).replace("-", "/")}までの記録`
            : ""}
        </span>
      </div>
      <div className="analytics-metrics" aria-label="集計指標">
        {(ranking ? rankMetrics : metrics).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={selected === value}
            onClick={() => (ranking ? setRankMetric(value) : setMetric(value as Metric))}
          >
            {labels[value]}
          </button>
        ))}
      </div>
      <ResourceError resource={resource} />
      {resource.error && !data ? null : !data ? (
        <LoadingState label={ranking ? "ランキングを読み込み中" : "グラフを読み込み中"} />
      ) : (
        <>
          <section
            className="analytics-summary"
            aria-label={`${labels[selected]}${ranking ? "ランキング" : "の要約"}`}
          >
            {!ranking && (
              <strong>
                {number(data.totals[selectedMetric])}
                <small> {units[selectedMetric]}</small>
              </strong>
            )}
          </section>
          {ranking && data.window.previous_start && (
            <p className="analytics-comparison muted">
              比較元{" "}
              {dates(
                data.window.previous_start,
                data.window.previous_end ?? data.window.previous_start,
              )}
            </p>
          )}
          {ranking ? (
            <>
              {!exercise && <p className="muted">種目を選ぶと最高重量・RM・成長も比較できます。</p>}
              <ol className="analytics-ranks" aria-label={`${labels[selectedRank]}ランキング`}>
                {entries.map((entry) => (
                  <li key={entry.user_id}>
                    <span className="rank-position">{entry.rank ?? "—"}</span>
                    <span className="rank-name">{entry.display_name}</span>
                    <strong>
                      {entry.value == null ? (
                        entry.status === "first" ? (
                          "初記録"
                        ) : (
                          "比較元0kg"
                        )
                      ) : (
                        <>
                          {number(entry.value)}
                          <small> {units[selectedRank]}</small>
                        </>
                      )}
                    </strong>
                  </li>
                ))}
              </ol>
              {!entries.length && <p className="muted">この期間は対象の記録がありません。</p>}
              {period === "all" && exercise && (
                <p className="muted">成長は週・月で前期間と比較できます。</p>
              )}
            </>
          ) : (
            <>
              <div {...swipe}>
                <AnalyticsChart
                  key={`${period}:${anchor}:${exercise}:${selectedMember}:${selectedGrain}`}
                  points={framePoints(
                    data.series[selectedGrain] ?? [],
                    period,
                    selectedGrain,
                    data.window.end,
                  )}
                  metric={selectedMetric}
                  grain={selectedGrain}
                  weeklyDays={period === "week" && selectedMetric === "days"}
                  onRecords={selectRecords}
                />
              </div>
              {!data.totals.sets && <p className="muted">この期間は記録がありません。</p>}
            </>
          )}
          {ranking ? (
            <p className="analytics-footnote muted">共有済みの記録のみで集計</p>
          ) : (
            <details className="analytics-help">
              <summary>指標について</summary>
              <p>総負荷 = 重量 × 回数の合計。最高推定1RMは1〜10回の記録から算出します。</p>
            </details>
          )}
        </>
      )}
    </section>
  );
}
