import { useState } from "react";
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
  const [selected, setSelected] = useState(
    Math.max(
      0,
      points.findLastIndex((p) => (p.sets ?? 0) > 0),
    ),
  );
  const index = Math.min(selected, points.length - 1);
  const point = points[index];
  const max = Math.max(1, ...points.map((p) => p[metric] ?? 0));
  const x = (i: number) => 50 + (i * 280) / Math.max(1, points.length - 1);
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
      <svg
        viewBox="0 0 350 212"
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const position = ((event.clientX - rect.left) / rect.width) * 350;
          setSelected(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                Math.round(((position - 50) / 280) * (points.length - 1)),
              ),
            ),
          );
        }}
        role="img"
        aria-label={`${labels[metric]}の推移`}
      >
        <title>{`${labels[metric]}の推移。下のスライダーで期間を選べます。`}</title>
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line x1="50" x2="334" y1={y(max * ratio)} y2={y(max * ratio)} className="chart-grid" />
            <text x="44" y={y(max * ratio) + 4} textAnchor="end">
              {number(max * ratio)}
            </text>
          </g>
        ))}
        {paths.map((d) => (
          <path key={d} d={d} fill="none" className="chart-line" />
        ))}
        {points.map((p, i) =>
          p[metric] == null ? null : (
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
      <input
        className="chart-slider"
        type="range"
        min="0"
        max={Math.max(0, points.length - 1)}
        value={index}
        aria-label="グラフの期間"
        aria-valuetext={`${dates(point.start, point.end)} ${number(point[metric])}${units[metric]}`}
        onChange={(event) => setSelected(Number(event.target.value))}
      />
      <div className="chart-selection" aria-live="polite">
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
            この期間の記録を見る ›
          </button>
        )}
      </div>
      {connectGaps && (
        <p className="analytics-footnote muted">実際の記録点を線でつないでいます。</p>
      )}
    </div>
  );
}
