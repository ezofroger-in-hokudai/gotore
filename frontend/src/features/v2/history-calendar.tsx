import type { ActivityDay } from "@/lib/api";
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { calendarDays, dateLabel, shiftMonth } from "../activity/calendar";
import { number } from "../analytics/chart";
import { addDays } from "../analytics/period";
import { heatLevel } from "./history-calendar-heat";

const monthLabel = (month: string) =>
  `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
type CalendarActivity = {
  days: (Omit<ActivityDay, "workout_count"> & {
    workout_count: number | null;
  })[];
  active_days: number;
  total_volume: number;
};
type Motion = {
  from: string;
  target: string;
  activity: CalendarActivity | null;
  scope: string;
  offset: number;
  direction: number;
};
type Gesture = {
  id: number;
  x: number;
  y: number;
  started: number;
  offset: number;
  axis: "x" | "y" | null;
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
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const pointer = useRef<Gesture | null>(null);
  const busy = useRef(false);
  const suppressClick = useRef(false);
  const queued = useRef<number[]>([]);
  const request = useRef<(direction: number, offset?: number) => void>(() => {});
  const [motion, setMotion] = useState<Motion | null>(null);
  const [dragging, setDragging] = useState(false);
  const valid = (next: string) => next >= oldestMonth && next <= current.slice(0, 7);

  request.current = (requested, offset = 0) => {
    if (busy.current) {
      if (requested && queued.current.length < 3) queued.current.push(requested);
      return;
    }
    const direction = valid(shiftMonth(month, requested)) ? requested : 0;
    if (!direction && !offset) return;
    busy.current = true;
    if (offset) suppressClick.current = true;
    const target = shiftMonth(month, direction);
    setMotion({
      from: month,
      target,
      activity,
      scope: scopeLabel,
      offset,
      direction,
    });
    // 到着を待たずに取得を始める。前月の値は退出する面にだけ残す。
    if (direction) onMonthChange(target);
  };

  useEffect(() => {
    if (!motion) {
      while (queued.current.length && !busy.current) request.current(queued.current.shift() ?? 0);
      return;
    }
    if (!track.current || !viewport.current) return;
    const element = track.current;
    const width = viewport.current.clientWidth;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    const finish = () => {
      if (disposed) return;
      element.style.transform = "translateX(-100%)";
      busy.current = false;
      setMotion(null);
      setDragging(false);
    };
    const animation = reduced
      ? null
      : element.animate(
          [
            { transform: `translateX(${-width + motion.offset}px)` },
            { transform: `translateX(${-width - motion.direction * width}px)` },
          ],
          {
            duration: motion.direction ? 280 : 180,
            easing: "cubic-bezier(.2,.75,.2,1)",
            fill: "forwards",
          },
        );
    if (animation) void animation.finished.then(finish, () => {});
    else finish();
    return () => {
      disposed = true;
      animation?.cancel();
    };
  }, [motion]);

  const endGesture = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start || busy.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const dx = event.clientX - start.x;
    const horizontal =
      start.axis === "x" ||
      (!start.axis && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(event.clientY - start.y) * 1.4);
    if (!horizontal) {
      setDragging(false);
      return;
    }
    const width = viewport.current?.clientWidth ?? 1;
    const offset = start.axis === "x" ? start.offset : dx;
    const velocity = Math.abs(offset) / Math.max(1, performance.now() - start.started);
    const commit =
      !cancelled && (Math.abs(offset) > width * 0.2 || (Math.abs(offset) > 35 && velocity > 0.45));
    request.current(commit ? (offset > 0 ? -1 : 1) : 0, offset);
  };
  const center = motion?.from ?? month;

  return (
    <div
      className="personal-history-card personal-history-calendar"
      data-moving={Boolean(motion || dragging)}
      onKeyDown={(event) => {
        if (!busy.current) suppressClick.current = false;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          request.current(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
      onPointerDown={(event) => {
        suppressClick.current = false;
        if (
          event.button !== 0 ||
          busy.current ||
          !(event.target instanceof Element) ||
          (event.target !== event.currentTarget &&
            !event.target.closest(".history-calendar-viewport"))
        )
          return;
        suppressClick.current = false;
        pointer.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          started: performance.now(),
          offset: 0,
          axis: null,
        };
      }}
      onPointerMove={(event) => {
        const start = pointer.current;
        if (!start || start.id !== event.pointerId || busy.current) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 7) {
          start.axis = Math.abs(dx) > Math.abs(dy) * 1.4 ? "x" : "y";
          if (start.axis === "x") {
            event.currentTarget.setPointerCapture(event.pointerId);
            suppressClick.current = true;
            setDragging(true);
          }
        }
        if (start.axis !== "x" || !track.current) return;
        const width = viewport.current?.clientWidth ?? 1;
        start.offset = valid(shiftMonth(month, dx > 0 ? -1 : 1))
          ? Math.max(-width, Math.min(width, dx))
          : dx * 0.18;
        track.current.style.transform = `translateX(${-width + start.offset}px)`;
      }}
      onPointerUp={endGesture}
      onPointerCancel={(event) => endGesture(event, true)}
      onClickCapture={(event) => {
        if (suppressClick.current && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {children}
      <div
        ref={viewport}
        className="history-calendar-viewport"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: 未読込中も左右矢印で月を移動できる操作領域。
        tabIndex={0}
        aria-label={`${monthLabel(month)}のカレンダー。左右矢印で月を変更`}
      >
        <div key={center} ref={track} className="history-calendar-track">
          {[-1, 0, 1].map((offset) => {
            const pageMonth = shiftMonth(center, offset);
            const active = pageMonth === month;
            const pageActivity = active
              ? activity
              : motion?.from === pageMonth && motion.scope === scopeLabel
                ? motion.activity
                : null;
            return (
              <CalendarMonth
                key={pageMonth}
                month={pageMonth}
                current={current}
                activity={pageActivity}
                scopeLabel={scopeLabel}
                active={active}
                onSelectDay={onSelectDay}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CalendarMonth({
  month,
  activity,
  current,
  scopeLabel,
  active,
  onSelectDay,
}: {
  month: string;
  activity: CalendarActivity | null;
  current: string;
  scopeLabel: string;
  active: boolean;
  onSelectDay: (day: string) => void;
}) {
  const dayList = calendarDays(month);
  const cells = [...dayList, ...Array.from({ length: 42 - dayList.length }, () => null)];
  const dayMap = new Map(activity?.days.map((day) => [day.date, day]));
  const monthVolumes = activity?.days.map((day) => day.volume) ?? [];
  // 隣の面は見た目だけ。日付操作・読み上げ・フォーカスは表示中の月に限定する。
  const prefix = active ? "personal-history" : "history-calendar-neighbor";
  return (
    <div
      className="history-calendar-page"
      data-active={active}
      data-month={month}
      aria-hidden={!active}
    >
      <div className={`${prefix}-month`}>
        <small>{Number(shiftMonth(month, -1).slice(5))}月</small>
        <strong>{monthLabel(month)}</strong>
        <small>
          {month < current.slice(0, 7) ? `${Number(shiftMonth(month, 1).slice(5))}月` : ""}
        </small>
      </div>
      <div className={`${prefix}-weekdays`} aria-hidden="true">
        {["月", "火", "水", "木", "金", "土", "日"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className={`${prefix}-days`}>
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
          const content = (
            <>
              {Number(day.slice(-2))}
              <small key={`${day}-volume`}>
                {item
                  ? item.volume >= 1000
                    ? `${number(item.volume / 1000)}k`
                    : `${number(item.volume)}kg`
                  : ""}
              </small>
            </>
          );
          return active ? (
            <button
              key={day}
              type="button"
              data-level={level}
              disabled={day > current || !activity}
              aria-label={`${dateLabel(day)}、${!activity ? "読み込み中" : item ? `${number(item.volume)}kg、${item.set_count}セット` : "記録なし"}`}
              onClick={() => onSelectDay(day)}
            >
              {content}
            </button>
          ) : (
            <span key={day} className="history-calendar-neighbor-day" data-level={level}>
              {content}
            </span>
          );
        })}
      </div>
      <div className={`${prefix}-calendar-foot`}>
        <span>
          {scopeLabel} · {activity?.active_days ?? "—"}日
        </span>
        <strong>{number(activity?.total_volume)}kg</strong>
      </div>
    </div>
  );
}
