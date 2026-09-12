import { useEffect, useState } from "react";
import { AnalyticsChart, dates, number } from "./chart";
import { type MetricCategory, metricCategories, metricCategory } from "./metric-category";
import { type Grain, type Metric, type Period, type RankMetric, labels, units } from "./types";
import { useAnalytics } from "./use-analytics";

const periods: Record<Period, string> = {
  week: "週",
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
  onRanking,
}: {
  scope?: string;
  active: boolean;
  prefetch?: boolean;
  refreshKey: number;
  ranking?: boolean;
  onRecords?: (start: string, end: string) => void;
  onRanking?: () => void;
}) {
  const [period, setPeriod] = useState<Period>(scope ? "week" : "month");
  const [offset, setOffset] = useState(0);
  const [exercise, setExercise] = useState("");
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [category, setCategory] = useState<MetricCategory>("volume");
  const [metricsByCategory, setMetricsByCategory] = useState<Record<MetricCategory, Metric>>({
    volume: "volume",
    strength: "weight",
    activity: "days",
  });
  const [ranksByCategory, setRanksByCategory] = useState<Record<MetricCategory, RankMetric>>({
    volume: "volume",
    strength: "weight",
    activity: "days",
  });
  const [grain, setGrain] = useState<Grain>("day");
  const resource = useAnalytics(scope, period, offset, exercise, active, prefetch, refreshKey);
  const data = resource.data;
  useEffect(() => {
    if (data) setExerciseNames(data.exercises);
    else if (resource.error) setExerciseNames([]);
  }, [data, resource.error]);
  const metrics: Metric[] = scope
    ? ["volume", "sets", "people"]
    : ["volume", "sets", "days", ...(exercise ? (["weight", "rm"] as const) : [])];
  const rankMetrics: RankMetric[] = [
    "volume",
    "sets",
    "days",
    ...(exercise ? (["weight", "rm"] as const) : []),
    ...(exercise && period !== "all"
      ? (["weight_growth", "weight_percent", "rm_growth", "rm_percent"] as const)
      : []),
  ];
  const categoryMetrics = metrics.filter((value) => metricCategory(value) === category);
  const categoryRanks = rankMetrics.filter((value) => metricCategory(value) === category);
  const selectedMetric = categoryMetrics.includes(metricsByCategory[category])
    ? metricsByCategory[category]
    : (categoryMetrics[0] ?? "volume");
  const selectedRank = categoryRanks.includes(ranksByCategory[category])
    ? ranksByCategory[category]
    : (categoryRanks[0] ?? "volume");
  const choices = ranking ? categoryRanks : categoryMetrics;
  const availableGrains = Object.keys(data?.series ?? {}) as Grain[];
  const selectedGrain = availableGrains.includes(grain) ? grain : (availableGrains[0] ?? "month");
  const selected = ranking ? selectedRank : selectedMetric;
  const entries = data?.rankings[selectedRank] ?? [];
  return (
    <section className="analytics-panel" aria-label={scope ? "グループ集計" : "履歴グラフ"}>
      <fieldset className="analytics-categories" aria-label="分析の目的">
        {(Object.keys(metricCategories) as MetricCategory[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
          >
            {metricCategories[value]}
          </button>
        ))}
      </fieldset>
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
        <label>
          期間
          <select
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value as Period);
              setOffset(0);
            }}
          >
            {(scope
              ? (["week", "month", "all"] as const)
              : (["month", "quarter", "year", "all"] as const)
            ).map((value) => (
              <option key={value} value={value}>
                {scope && value === "month" ? "月" : periods[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="analytics-period">
        <button
          type="button"
          className="secondary"
          aria-label="前の期間"
          disabled={period === "all" || !data?.window.can_previous}
          onClick={() => setOffset(offset + 1)}
        >
          ‹
        </button>
        <span>{data ? dates(data.window.start, data.window.end) : "期間を読み込み中…"}</span>
        <button
          type="button"
          className="secondary"
          aria-label="次の期間"
          disabled={!offset}
          onClick={() => setOffset(offset - 1)}
        >
          ›
        </button>
      </div>
      {choices.length > 0 && (
        <label className="analytics-indicator">
          指標
          <select
            value={selected}
            onChange={(event) =>
              ranking
                ? setRanksByCategory({
                    ...ranksByCategory,
                    [category]: event.target.value as RankMetric,
                  })
                : setMetricsByCategory({
                    ...metricsByCategory,
                    [category]: event.target.value as Metric,
                  })
            }
          >
            {choices.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </label>
      )}
      {resource.error ? (
        <div className="analytics-placeholder">
          <p role="alert" className="error">
            {resource.error}
          </p>
          <button type="button" className="secondary" onClick={resource.retry}>
            再試行
          </button>
        </div>
      ) : !data ? (
        <output className="analytics-placeholder">グラフを準備しています…</output>
      ) : !choices.length ? (
        <div className="analytics-placeholder">
          {scope && !ranking ? (
            <>
              <p>種目別の強さはランキングで確認できます。</p>
              {onRanking && (
                <button type="button" className="secondary" onClick={onRanking}>
                  ランキングで見る
                </button>
              )}
            </>
          ) : (
            <p>種目を選ぶと最高重量・RMを確認できます。</p>
          )}
        </div>
      ) : (
        <>
          <div className="analytics-summary">
            <span>{ranking ? "グループランキング" : labels[selectedMetric]}</span>
            {!ranking && (
              <strong>
                {number(data.totals[selectedMetric])}
                <small> {units[selectedMetric]}</small>
              </strong>
            )}
            <span className="muted">
              {resource.loading
                ? "更新中…"
                : `${data.totals.days}日間の記録${scope ? ` · ${data.totals.people}人が活動` : ""}`}
            </span>
          </div>
          {ranking ? (
            <>
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
              <AnalyticsChart
                key={`${period}:${offset}:${exercise}:${selectedGrain}`}
                points={data.series[selectedGrain] ?? []}
                metric={selectedMetric}
                onRecords={onRecords}
              />
              <details className="analytics-details">
                <summary>表示設定</summary>
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
              </details>
              {!data.totals.sets && <p className="muted">この期間は記録がありません。</p>}
            </>
          )}
          {(data.previous_totals || data.window.previous_start) && (
            <details className="analytics-details">
              <summary>前期間と比較</summary>
              {!ranking && data.previous_totals && (
                <p className="analytics-comparison muted">
                  前期間比{" "}
                  {data.totals[selectedMetric] != null &&
                  data.previous_totals[selectedMetric] != null
                    ? `${(data.totals[selectedMetric] ?? 0) - (data.previous_totals[selectedMetric] ?? 0) >= 0 ? "+" : ""}${number((data.totals[selectedMetric] ?? 0) - (data.previous_totals[selectedMetric] ?? 0))}${units[selectedMetric]}`
                    : "比較記録なし"}
                </p>
              )}
              {data.window.previous_start && (
                <p className="analytics-comparison muted">
                  比較元{" "}
                  {dates(
                    data.window.previous_start,
                    data.window.previous_end ?? data.window.previous_start,
                  )}
                </p>
              )}
            </details>
          )}
          <details className="analytics-details">
            <summary>集計方法</summary>
            <p className="analytics-footnote muted">
              {ranking
                ? "現在グループに共有されている記録で集計します。"
                : "総負荷 = 重量 × 回数の合計。最高推定1RMは1〜10回の記録から算出します。"}
            </p>
          </details>
        </>
      )}
    </section>
  );
}
