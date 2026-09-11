"use client";

import type { MonthlyActivity } from "@/lib/api";
import { today } from "../training/draft";
import { useResource } from "../training/use-resource";
import { calendarDays, dateLabel, heatLevel, shiftMonth } from "./calendar";

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
  const currentDay = today();
  const currentMonth = currentDay.slice(0, 7);
  const activity = useResource<MonthlyActivity>(
    `/workouts/activity?month=${month}`,
    refreshKey,
    false,
    true,
    { enabled: active, prefetch, retainOnRefresh: true },
  );
  const days = new Map(activity.data?.days.map((day) => [day.date, day]));

  function changeMonth(value: string) {
    if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value) || value < "2000-01" || value > currentMonth)
      return;
    onMonthChange(value);
    onSelect("");
  }

  return (
    <section className="panel activity-calendar" aria-label="活動カレンダー">
      <h2>カレンダー</h2>

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
          月
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
            <dt>合計セット</dt>
            <dd>
              {activity.data?.total_sets ?? "—"}
              <small>セット</small>
            </dd>
          </div>
          <div>
            <dt>活動日数</dt>
            <dd>
              {activity.data?.active_days ?? "—"}
              <small>日</small>
            </dd>
          </div>
          <div>
            <dt>記録件数</dt>
            <dd>
              {activity.data?.workout_count ?? "—"}
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
            const sets = counts?.set_count ?? 0;
            const future = day > currentDay;
            return (
              <button
                key={day}
                type="button"
                className="activity-day"
                data-level={future ? 0 : heatLevel(sets)}
                disabled={future || !activity.data}
                aria-label={`${dateLabel(day)}、${future ? "未来の日付" : !activity.data ? "未取得" : `${sets}セット、${counts?.workout_count ?? 0}件`}`}
                aria-pressed={selectedDate === day}
                aria-current={day === currentDay ? "date" : undefined}
                onClick={() => onSelect(day)}
              >
                <span>{Number(day.slice(-2))}</span>
                <small>{future || !activity.data ? "—" : `${sets}set`}</small>
              </button>
            );
          })}
        </div>
        <div className="activity-legend" aria-label="色の凡例（セット数）">
          {["0", "1〜5", "6〜10", "11〜20", "21以上"].map((label, level) => (
            <span key={label}>
              <span className="heat-swatch" data-level={level} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
        {activity.data?.workout_count === 0 && <p className="muted">この月は記録なし</p>}
      </>
    </section>
  );
}
