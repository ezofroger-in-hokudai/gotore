"use client";

import type { MonthlyActivity } from "@/lib/api";
import { useState } from "react";
import { today } from "../training/draft";
import { useResource } from "../training/use-resource";
import { calendarDays, dateLabel, heatLevel, shiftMonth } from "./calendar";

export function ActivityCalendar({
  selectedDate,
  onSelect,
  refreshKey,
}: {
  selectedDate: string;
  onSelect: (value: string) => void;
  refreshKey: number;
}) {
  const currentDay = today();
  const currentMonth = currentDay.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const activity = useResource<MonthlyActivity>(`/workouts/activity?month=${month}`, refreshKey);
  const days = new Map(activity.data?.days.map((day) => [day.date, day]));

  function changeMonth(value: string) {
    if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value) || value < "2000-01" || value > currentMonth)
      return;
    setMonth(value);
    onSelect("");
  }

  return (
    <section className="panel activity-calendar" aria-label="活動カレンダー">
      <p className="eyebrow">YOUR ACTIVITY</p>
      <h2>トレーニングの積み重ね</h2>
      <p className="muted">
        色の濃さは1日の合計セット数です。日付をタップすると記録を確認できます。
      </p>
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
          表示する月
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
            活動カレンダーを再取得
          </button>
        </div>
      )}
      {!activity.data && !activity.error && (
        <output className="loading">活動カレンダーを読み込んでいます…</output>
      )}
      {activity.data && (
        <>
          {activity.loading && <output className="muted">活動カレンダーを更新しています…</output>}
          <dl className="activity-totals">
            <div>
              <dt>合計セット</dt>
              <dd>
                {activity.data.total_sets}
                <small>セット</small>
              </dd>
            </div>
            <div>
              <dt>活動日数</dt>
              <dd>
                {activity.data.active_days}
                <small>日</small>
              </dd>
            </div>
            <div>
              <dt>記録件数</dt>
              <dd>
                {activity.data.workout_count}
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
                  disabled={future}
                  aria-label={`${dateLabel(day)}、${future ? "未来の日付" : `${sets}セット、${counts?.workout_count ?? 0}件`}`}
                  aria-pressed={selectedDate === day}
                  aria-current={day === currentDay ? "date" : undefined}
                  onClick={() => onSelect(day)}
                >
                  <span>{Number(day.slice(-2))}</span>
                  <small>{future ? "—" : `${sets}set`}</small>
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
          {activity.data.workout_count === 0 && (
            <p className="muted">この月の記録はまだありません。</p>
          )}
        </>
      )}
    </section>
  );
}
