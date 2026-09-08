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
          <p>下書きをこの記録で置き換えますか？</p>

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
