import { useRef } from "react";
import { today } from "../training/draft";
import { addDays, frameEnd } from "./period";
import type { Period } from "./types";

export function PeriodPicker({
  anchor,
  period,
  onChange,
}: { anchor: string; period: Period; onChange: (value: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const current = today();
  const week = period === "week";
  if (period === "all") return <div className="history-period-picker">全期間</div>;
  return (
    <div className="history-period-picker">
      <button
        type="button"
        className="text-button"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        {week
          ? `${addDays(anchor, -((new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7))
              .slice(5)
              .replace("-", "/")}〜${frameEnd(anchor, "week").slice(5).replace("-", "/")}`
          : `${Number(anchor.slice(0, 4))}年${Number(anchor.slice(5, 7))}月`}
        ⌄
      </button>
      {anchor.slice(0, week ? 10 : 7) !== current.slice(0, week ? 10 : 7) && (
        <button type="button" className="text-button" onClick={() => onChange(current)}>
          現在に戻る
        </button>
      )}
      <dialog ref={dialog} className="history-picker-dialog" aria-label="期間を選ぶ">
        <div className="section-heading">
          <h2>期間を選ぶ</h2>
          <button type="button" className="text-button" onClick={() => dialog.current?.close()}>
            閉じる
          </button>
        </div>
        <label>
          {week ? "週を選ぶ日付" : "月"}
          <input
            type={week ? "date" : "month"}
            value={anchor.slice(0, week ? 10 : 7)}
            min={week ? "2000-01-01" : "2000-01"}
            max={current.slice(0, week ? 10 : 7)}
            onChange={(event) => {
              const v = event.target.value;
              if (!v || !event.target.validity.valid) return;
              onChange(week ? v : `${v}-01`);
              dialog.current?.close();
            }}
          />
        </label>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onChange(current);
            dialog.current?.close();
          }}
        >
          現在に戻る
        </button>
      </dialog>
    </div>
  );
}
