"use client";

import { LoadingState } from "../loading/loading-state";

import type { BodyPart, MonthlyActivity } from "@/lib/api";
import { useState } from "react";
import { PART_FILTERS } from "../exercises/body-parts";
import { today } from "../training/draft";
import { ResourceError } from "../training/resource-error";
import { useResource } from "../training/use-resource";
import { activityForParts, orderedParts, toggleActivityPart } from "./body-parts";
import { calendarDays, dateLabel, shiftMonth } from "./calendar";
import { volumeAppearance } from "./volume-colors";

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
  const [parts, setParts] = useState<BodyPart[]>([]);
  const currentDay = today();
  const currentMonth = currentDay.slice(0, 7);
  const activity = useResource<MonthlyActivity>(
    `/workouts/activity?month=${month}`,
    refreshKey,
    active,
    true,
    { enabled: active, prefetch, retainOnRefresh: true },
  );
  const hasParts = !activity.data?.days.some(
    (day) =>
      !day.body_parts ||
      day.body_parts.some((entry) => !entry.body_part || entry.body_part === "full_body"),
  );
  const selectedParts = hasParts ? parts : [];
  const data = activity.data ? activityForParts(activity.data, selectedParts) : null;
  const partLabel = PART_FILTERS.filter(
    (entry) => entry.value !== "all" && selectedParts.includes(entry.value),
  )
    .map((entry) => entry.label)
    .join("・");
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
      <fieldset
        className="activity-part-filters"
        data-tour="calendar"
        aria-label="カレンダーの部位"
      >
        {PART_FILTERS.map((entry) => (
          <button
            type="button"
            key={entry.value}
            aria-pressed={
              entry.value === "all" ? !selectedParts.length : selectedParts.includes(entry.value)
            }
            disabled={entry.value !== "all" && (!activity.data || !hasParts)}
            onClick={() => {
              setParts(toggleActivityPart(selectedParts, entry.value));
              onSelect("");
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
      <ResourceError resource={activity} />
      {activity.loading && !activity.data && !activity.error ? (
        <LoadingState label="活動カレンダーを読み込み中" compact />
      ) : (
        <output className="resource-status muted">
          {activity.loading && activity.data ? "更新中…" : ""}
        </output>
      )}
      <>
        <dl className="activity-totals" aria-label={`${partLabel || "すべて"}の月間集計`}>
          <div>
            <dt>総負荷</dt>
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
                aria-label={`${dateLabel(day)}、${future ? "未来の日付" : !activity.data ? "未取得" : `${label}、${counts?.workout_count === null ? "件数未取得" : `${counts?.workout_count ?? 0}件`}${bodyParts.length ? `、${bodyParts.map((item) => item.label).join("・")}` : ""}`}`}
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
        {data?.active_days === 0 && (
          <p className="muted">
            {!selectedParts.length ? "この月は記録なし" : `この月の${partLabel}は記録なし`}
          </p>
        )}
        {!!selected?.body_parts?.length && (
          <section
            className="activity-part-breakdown"
            aria-label={`${dateLabel(selected.date)}の部位内訳`}
          >
            <dl>
              {orderedParts(selected.body_parts).map((entry) => (
                <div key={entry.body_part}>
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
