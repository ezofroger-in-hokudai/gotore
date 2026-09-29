import type { ActivityDay } from "@/lib/api";
import { type ReactNode, useRef } from "react";
import { calendarDays, dateLabel, shiftMonth } from "../activity/calendar";
import { number } from "../analytics/chart";
import { addDays } from "../analytics/period";
import { heatLevel } from "./history-calendar-heat";

const monthLabel = (month: string) =>
  `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
type CalendarActivity = {
  days: (Omit<ActivityDay, "workout_count"> & { workout_count: number | null })[];
  active_days: number;
  total_volume: number;
};

export function HistoryCalendar({
  month,
  activity,
  current,
  oldestMonth,
  scopeLabel,
  onMonthChange,
  onSelectDay,
  children,
}: {
  month: string;
  activity: CalendarActivity | null;
  current: string;
  oldestMonth: string;
  scopeLabel: string;
  onMonthChange: (month: string) => void;
  onSelectDay: (day: string) => void;
  children?: ReactNode;
}) {
  const dayList = calendarDays(month);
  const cells = [...dayList, ...Array.from({ length: 42 - dayList.length }, () => null)];
  const dayMap = new Map(activity?.days.map((day) => [day.date, day]));
  const monthVolumes = activity?.days.map((day) => day.volume) ?? [];
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const changeMonth = (next: string) => {
    if (next >= oldestMonth && next <= current.slice(0, 7)) onMonthChange(next);
  };

  return (
    <div
      className="personal-history-card personal-history-calendar"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight")
          changeMonth(shiftMonth(month, event.key === "ArrowLeft" ? -1 : 1));
      }}
      onPointerDown={(event) => {
        pointer.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = pointer.current;
        pointer.current = null;
        if (!start) return;
        const dx = event.clientX - start.x;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(event.clientY - start.y) * 1.4)
          changeMonth(shiftMonth(month, dx > 0 ? -1 : 1));
      }}
      onPointerCancel={() => {
        pointer.current = null;
      }}
    >
      <div className="personal-history-month">
        <small>{shiftMonth(month, -1).slice(5)}月</small>
        <strong>{monthLabel(month)}</strong>
        <small>
          {month < current.slice(0, 7) ? `${Number(shiftMonth(month, 1).slice(5))}月` : ""}
        </small>
      </div>
      <div className="personal-history-weekdays" aria-hidden="true">
        {(["月", "火", "水", "木", "金", "土", "日"] as const).map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      {children}
      <div className="personal-history-days">
        {cells.map((day, index) => {
          if (!day) {
            const adjacent = addDays(`${month}-01`, index - dayList.findIndex(Boolean));
            return (
              <span key={adjacent} className="personal-history-empty">
                {Number(adjacent.slice(-2))}
              </span>
            );
          }
          const item = dayMap.get(day);
          const level = heatLevel(item?.volume ?? null, monthVolumes);
          const future = day > current;
          return (
            <button
              key={day}
              type="button"
              data-level={level}
              disabled={future || !activity}
              aria-label={`${dateLabel(day)}、${item ? `${number(item.volume)}kg、${item.set_count}セット` : "記録なし"}`}
              onClick={() => onSelectDay(day)}
            >
              {Number(day.slice(-2))}
              <small>
                {item
                  ? item.volume >= 1000
                    ? `${number(item.volume / 1000)}k`
                    : `${number(item.volume)}kg`
                  : ""}
              </small>
            </button>
          );
        })}
      </div>
      <div className="personal-history-calendar-foot">
        <span>
          {scopeLabel} · {activity?.active_days ?? "—"}日
        </span>
        <strong>{number(activity?.total_volume)}kg</strong>
      </div>
    </div>
  );
}
