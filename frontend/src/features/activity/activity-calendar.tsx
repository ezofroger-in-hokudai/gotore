"use client";

import type { MonthlyActivity } from "@/lib/api";
import { useRef, useState } from "react";
import { type BodyPartFilter, PART_FILTERS } from "../exercises/body-parts";
import { today } from "../training/draft";
import { useResource } from "../training/use-resource";
import { activityForPart, orderedParts } from "./body-parts";
import { calendarDays, dateLabel, shiftMonth } from "./calendar";
import { volumeAppearance, volumeGradient } from "./volume-colors";

export function ActivityCalendar({
  month,
  onMonthChange,
  selectedDate,
  onSelect,
  refreshKey,
  active = true,
  prefetch = false,
}: {
  month: string;
  onMonthChange: (value: string) => void;
  selectedDate: string;
  onSelect: (value: string) => void;
  refreshKey: number;
  active?: boolean;
  prefetch?: boolean;
}) {
  const [part, setPart] = useState<BodyPartFilter>("all");
  const filters = useRef<HTMLFieldSetElement>(null);
  const currentDay = today();
  const currentMonth = currentDay.slice(0, 7);
  const activity = useResource<MonthlyActivity>(
    `/workouts/activity?month=${month}`,
    refreshKey,
    active,
    true,
    { enabled: active, prefetch, retainOnRefresh: true },
  );
  const hasParts = !activity.data?.days.some((day) => !day.body_parts);
  const selectedPart = hasParts ? part : "all";
  const data = activity.data ? activityForPart(activity.data, selectedPart) : null;
  const partLabel = PART_FILTERS.find((entry) => entry.value === selectedPart)?.label ?? "すべて";
  const maximum = Math.max(0, ...(data?.days.map((day) => day.volume) ?? []));
  const selected = activity.data?.days.find((day) => day.date === selectedDate);
  const format = (value: number) => value.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
  const days = new Map(data?.days.map((day) => [day.date, day]));

  function changeMonth(value: string) {
    if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value) || value < "2000-01" || value > currentMonth)
      return;
    onMonthChange(value);
    onSelect("");
  }

  return (
    <section className="panel activity-calendar" aria-label="活動カレンダー">
      <fieldset className="activity-part-filters" ref={filters} aria-label="カレンダーの部位">
        {PART_FILTERS.map((entry) => (
          <button
            type="button"
            key={entry.value}
            aria-pressed={selectedPart === entry.value}
            disabled={entry.value !== "all" && (!activity.data || !hasParts)}
            onClick={(event) => {
              setPart(entry.value);
              onSelect("");
              const container = filters.current;
              if (container) {
                const button = event.currentTarget;
                const left = button.offsetLeft - container.offsetLeft;
                if (left < container.scrollLeft) container.scrollLeft = left;
                else if (left + button.offsetWidth > container.scrollLeft + container.clientWidth)
                  container.scrollLeft = left + button.offsetWidth - container.clientWidth;
              }
            }}
          >
            {entry.label}
          </button>
        ))}
      </fieldset>
      <div className="activity-month">
        <button
          type="button"
          className="secondary"
          aria-label="前の月"
          disabled={month <= "2000-01"}
          onClick={() => changeMonth(shiftMonth(month, -1))}
        >
          ←
        </button>
        <label className="grow">
          <span className="sr-only">月</span>
          <input
            type="month"
            min="2000-01"
            max={currentMonth}
            value={month}
            onChange={(event) => changeMonth(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary"
          aria-label="次の月"
          disabled={month >= currentMonth}
          onClick={() => changeMonth(shiftMonth(month, 1))}
        >
          →
        </button>
      </div>
      {activity.error && (
        <div className="error" role="alert">
          {activity.error}
          <button type="button" className="text-button" onClick={activity.retry}>
            再試行
          </button>
        </div>
      )}
      <output className="resource-status muted">
        {activity.loading ? (activity.data ? "更新中…" : "読み込み中…") : ""}
      </output>
      <>
        <dl className="activity-totals">
          <div>
            <dt>{selectedPart === "all" ? "月の総負荷" : `${partLabel}の総負荷`}</dt>
            <dd>
              {data ? format(data.total_volume) : "—"}
              <small>kg</small>
            </dd>
          </div>
          <div>
            <dt>活動日数</dt>
            <dd>
              {data?.active_days ?? "—"}
              <small>日</small>
            </dd>
          </div>
          <div>
            <dt>記録件数</dt>
            <dd>
              {data?.workout_count ?? "—"}
              <small>件</small>
            </dd>
          </div>
        </dl>
        <div className="activity-weekdays" aria-hidden="true">
          {["月", "火", "水", "木", "金", "土", "日"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="activity-grid">
          {calendarDays(month).map((day, index) => {
            // biome-ignore lint/suspicious/noArrayIndexKey: 空白セルは固定の曜日位置を表す。
            if (!day) return <span key={`blank-${index}`} aria-hidden="true" />;
            const counts = days.get(day);
            const volume = counts?.volume ?? null;
            const bodyParts = orderedParts(counts?.body_parts);
            const label = volume !== null ? `総負荷${format(volume)}kg` : "記録なし";
            const future = day > currentDay;
            return (
              <button
                key={day}
                type="button"
                className="activity-day"
                data-volume={future ? undefined : (volume ?? undefined)}
                style={volumeAppearance(future ? null : volume, maximum)}
                disabled={future || !activity.data}
                aria-label={`${dateLabel(day)}、${future ? "未来の日付" : !activity.data ? "未取得" : `${label}、${counts?.workout_count ?? 0}件${bodyParts.length ? `、${bodyParts.map((item) => item.label).join("・")}` : ""}`}`}
                aria-pressed={selectedDate === day}
                aria-current={day === currentDay ? "date" : undefined}
                onClick={() => onSelect(day)}
              >
                <span>{Number(day.slice(-2))}</span>
                <span className="activity-day-part" aria-hidden="true">
                  {!future && bodyParts.length ? (
                    <>
                      {bodyParts[0].label}
                      {bodyParts.length > 1 && <sup>+{bodyParts.length - 1}</sup>}
                    </>
                  ) : null}
                </span>
                <small>
                  {future || volume === null
                    ? "—"
                    : volume >= 1000
                      ? `${format(volume / 1000)}k`
                      : format(volume)}
                </small>
              </button>
            );
          })}
        </div>
        <div
          className="activity-legend volume-legend"
          aria-label="色の凡例（総負荷kg・月内の相対表示）"
        >
          <span>
            <span
              className="heat-swatch"
              style={volumeAppearance(null, maximum)}
              aria-hidden="true"
            />
            未記録
          </span>
          <div className="volume-gradient-legend">
            <span style={{ background: volumeGradient }} aria-hidden="true" />
            <div>
              <span>0kg</span>
              <span>{format(maximum / 2)}kg</span>
              <span>{format(maximum)}kg</span>
            </div>
          </div>
        </div>
        <p className="muted">
          重量×回数の合計（kg）。1k＝1,000kg。色は{selectedPart === "all" ? "全体" : partLabel}
          の月内最大値が基準。
        </p>
        {data?.workout_count === 0 && (
          <p className="muted">
            {selectedPart === "all" ? "この月は記録なし" : `この月の${partLabel}は記録なし`}
          </p>
        )}
        {!!selected?.body_parts?.length && (
          <section
            className="activity-part-breakdown"
            aria-label={`${dateLabel(selected.date)}の部位内訳`}
          >
            <p className="muted">主部位の内訳</p>
            <dl>
              {orderedParts(selected.body_parts).map((entry) => (
                <div key={entry.body_part ?? "unclassified"}>
                  <dt>{entry.label}</dt>
                  <dd>
                    {entry.set_count}セット · {format(entry.volume)}kg
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </>
    </section>
  );
}
