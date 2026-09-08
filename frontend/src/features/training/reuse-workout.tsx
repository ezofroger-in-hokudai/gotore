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
          <p>
            この内容を今日の新しい下書きにコピーしますか？入力途中の下書きがある場合は置き換わります。元の記録は変わりません。
          </p>
          <p className="muted">共有先は「自分だけ」で始めます。保存前に内容を見直してください。</p>
          <div className="reuse-buttons">
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              キャンセル
            </button>
            <button type="button" className="primary" onClick={() => onReuse(record)}>
              コピーして入力する
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="secondary" onClick={() => setConfirming(true)}>
          この内容でもう一度
        </button>
      )}
    </div>
  );
}
