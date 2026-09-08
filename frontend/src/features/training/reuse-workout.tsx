"use client";
import type { Workout } from "@/lib/api";
import { useState } from "react";

export function ReuseWorkout({
  record,
  onReuse,
}: { record: Workout; onReuse: (record: Workout) => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="reuse-workout">
      {confirming ? (
        <>
          <p>この記録を今日のトレーニングへコピーしますか？</p>

          <div className="reuse-buttons">
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              キャンセル
            </button>
            <button type="button" className="primary" onClick={() => onReuse(record)}>
              コピーする
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="secondary" onClick={() => setConfirming(true)}>
          コピー
        </button>
      )}
    </div>
  );
}
