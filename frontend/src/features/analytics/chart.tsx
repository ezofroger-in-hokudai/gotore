import { useId, useState } from "react";
import { chartKind, chartMaximum } from "./presentation";
import { type Metric, type Point, labels, units } from "./types";

export const number = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
export const dates = (start: string, end: string) =>
  start === end
    ? start.replaceAll("-", "/")
    : `${start.replaceAll("-", "/")} 〜 ${end.replaceAll("-", "/")}`;

export function AnalyticsChart({
  points,
  metric,
  onRecords,
}: {
  points: Point[];
  metric: Metric;
  onRecords?: (start: string, end: string) => void;
}) {
  const selectionId = useId();
  const [selected, setSelected] = useState(
    Math.max(
      0,
      points.findLastIndex((p) => (p.sets ?? 0) > 0),
    ),
  );
  const index = Math.min(selected, points.length - 1);
  const point = points[index];
  const bars = chartKind(metric) === "bar";
  const max = chartMaximum(
    metric,
    points.map((p) => p[metric]),
  );
  const slot = 280 / Math.max(1, points.length);
  const barWidth = Math.min(32, slot * 0.7);
  const x = (i: number) =>
    bars ? 50 + (i + 0.5) * slot : 50 + (i * 280) / Math.max(1, points.length - 1);
  const y = (value: number) => 175 - (value / max) * 135;
  const connectGaps = metric === "weight" || metric === "rm";
  const paths: string[] = [];
  let path = "";
  points.forEach((p, i) => {
    if (p[metric] == null) {
      if (connectGaps) return;
      if (path) paths.push(path);
      path = "";
    } else path += `${path ? " L" : "M"}${x(i)},${y(p[metric])}`;
  });
  if (path) paths.push(path);
  if (!point) return <p className="muted">まだ記録がありません</p>;
  return (
    <div className="analytics-chart">
      <fieldset
        className="chart-touch-target"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: グラフ内の選択を左右キーでも操作できるようにする。
        tabIndex={0}
        aria-label="グラフの期間選択"
        aria-describedby={selectionId}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const position = ((event.clientX - rect.left) / rect.width) * 350;
          setSelected(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                bars
                  ? Math.floor((position - 50) / slot)
                  : Math.round(((position - 50) / 280) * (points.length - 1)),
              ),
            ),
          );
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const next =
            event.key === "ArrowLeft"
              ? index - 1
              : event.key === "ArrowRight"
                ? index + 1
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? points.length - 1
                    : null;
          if (next === null) return;
          event.preventDefault();
          setSelected(Math.max(0, Math.min(points.length - 1, next)));
        }}
      >
        <svg viewBox="0 0 350 212" role="img" aria-label={`${labels[metric]}の推移`}>
          <title>{`${labels[metric]}の推移。グラフをタッチして期間を選べます。キーボードでは左右キーで選べます。`}</title>
          {[0, 0.5, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1="50"
                x2="334"
                y1={y(max * ratio)}
                y2={y(max * ratio)}
                className="chart-grid"
              />
              <text x="44" y={y(max * ratio) + 4} textAnchor="end">
                {number(max * ratio)}
              </text>
            </g>
          ))}
          <text x="44" y="26" textAnchor="end">
            {units[metric]}
          </text>
          {!bars && paths.map((d) => <path key={d} d={d} fill="none" className="chart-line" />)}
          {points.map((p, i) =>
            p[metric] == null ? null : bars ? (
              <rect
                key={p.start}
                x={x(i) - barWidth / 2}
                y={y(p[metric])}
                width={barWidth}
                height={175 - y(p[metric])}
                className="chart-bar"
                opacity={i === index ? 1 : 0.65}
              />
            ) : (
              <circle
                key={p.start}
                cx={x(i)}
                cy={y(p[metric])}
                r={i === index ? 5 : 2.5}
                className="chart-dot"
              />
            ),
          )}
          <line x1={x(index)} x2={x(index)} y1="28" y2="178" className="chart-cursor" />
          <text x="50" y="201">
            {points[0].start.slice(5).replace("-", "/")}
          </text>
          <text x="330" y="201" textAnchor="end">
            {points.at(-1)?.end.slice(5).replace("-", "/")}
          </text>
        </svg>
      </fieldset>
      <div id={selectionId} className="chart-selection" aria-live="polite">
        <span>{dates(point.start, point.end)}</span>
        <strong>
          {number(point[metric])}
          <small> {units[metric]}</small>
        </strong>
        {point[metric] == null && <span className="muted">この期間は対象の記録なし</span>}
        {onRecords && (
          <button
            type="button"
            className="text-button"
            onClick={() => onRecords(point.start, point.end)}
          >
            記録を見る
          </button>
        )}
      </div>
      {connectGaps && (
        <p className="analytics-footnote muted">実際の記録点を線でつないでいます。</p>
      )}
    </div>
  );
}
