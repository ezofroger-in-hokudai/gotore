import type { TrainingSession, Workout } from "@/lib/api";
import { type CSSProperties, useState } from "react";
import { Sheet } from "../v2/sheet";
import { finishWeekDays, sessionTotals } from "./finish-week";
import "./finish-confirm-dialog.css";

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const number = (value: number) => value.toLocaleString("ja-JP");

export function FinishConfirmDialog({
  session,
  records,
  dirty,
  busy,
  onClose,
  onFinish,
}: {
  session: TrainingSession;
  records: Workout[] | null;
  dirty: boolean;
  busy: boolean;
  onClose: () => void;
  onFinish: () => void;
}) {
  const totals = sessionTotals(session.exercises);
  const days = finishWeekDays(session.performed_on, records ?? [], session);
  const [selectedDate, setSelectedDate] = useState(session.performed_on);
  const selected = days.find((day) => day.date === selectedDate) ?? days.at(-1);
  const maxVolume = Math.max(1, ...days.map((day) => day.volume));
  const ready = records !== null;

  return (
    <Sheet title="トレーニング終了" variant="center" onClose={onClose}>
      <div className="finish-dialog-content">
        <p className="finish-dialog-label">今回の総負荷</p>
        <div className="finish-dialog-volume">
          {number(totals.volume)}
          <small>kg</small>
        </div>
        <div className="finish-dialog-stats">
          <span>
            <strong>{number(totals.sets)}</strong>セット
          </span>
          <span>
            <strong>{number(totals.exercises)}</strong>種目
          </span>
        </div>
        <div className="finish-dialog-chart">
          <div className="finish-dialog-chart-heading">
            <strong>この数日の記録</strong>
            <span>日別の総負荷</span>
          </div>
          <div className="finish-dialog-bars" aria-label="直近7日の日別総負荷">
            {days.map((day) => {
              const current = day.date === session.performed_on;
              const selectedDay = day.date === selectedDate;
              const height = Math.max(8, Math.round((day.volume / maxVolume) * 100));
              return (
                <button
                  key={day.date}
                  type="button"
                  className={`finish-dialog-day${current ? " is-current" : ""}${selectedDay ? " is-selected" : ""}${day.workoutCount === 0 ? " is-empty" : ""}${!ready ? " is-pending" : ""}`}
                  disabled={!ready}
                  aria-pressed={selectedDay}
                  aria-label={`${day.date}、${day.workoutCount ? `${day.workoutCount}回合計、${number(day.volume)}kg` : "記録なし"}`}
                  onClick={() => setSelectedDate(day.date)}
                  style={{ "--bar-height": `${height}%` } as CSSProperties}
                >
                  <span className="finish-dialog-bar-track">
                    <span className="finish-dialog-bar" />
                  </span>
                  <span className="finish-dialog-day-label">{shortDate(day.date)}</span>
                </button>
              );
            })}
          </div>
          <div className="finish-dialog-day-detail">
            <span>
              {shortDate(selected?.date ?? session.performed_on)}
              {ready && selected && selected.workoutCount > 1
                ? ` · ${selected.workoutCount}回合計`
                : ready && selected?.date === session.performed_on && selected.workoutCount > 0
                  ? " · 今回"
                  : ""}
            </span>
            <strong>
              {ready && selected
                ? selected.workoutCount
                  ? `${number(selected.volume)}kg`
                  : "記録なし"
                : "—"}
            </strong>
          </div>
        </div>
        <div className="finish-dialog-divider" />
        <h2>今回のトレーニングを終了しますか？</h2>
        {dirty && (
          <p className="finish-dialog-dirty">
            入力中の数値はまだセットに追加されていません。追加済みのセットだけを残して終了します。
          </p>
        )}
        <div className="finish-dialog-actions">
          <button className="finish-dialog-end" type="button" disabled={busy} onClick={onFinish}>
            終了する
          </button>
          <button className="finish-dialog-back" type="button" disabled={busy} onClick={onClose}>
            トレーニングに戻る
          </button>
        </div>
      </div>
    </Sheet>
  );
}
