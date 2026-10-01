import { useEffect, useMemo, useState } from "react";
import { useRecordSnapshot } from "../record-cache/record-snapshot-provider";
import { InlineMemo } from "../session/inline-memo";
import { useVisibleMemo } from "./memo-delivery-provider";

export function RecordExerciseMemo({
  workoutId,
  name,
  userId,
  active,
}: { workoutId: string; name: string; userId: string; active: boolean }) {
  const cache = useRecordSnapshot();
  const title = `${name}の記録メモ`;
  const path = `/sessions/${workoutId}/exercise-memo?name=${encodeURIComponent(name)}`;
  const target = useMemo(() => ({ path, label: title }), [path, title]);
  const entry = useVisibleMemo(target, active);
  const cached = cache?.snapshot?.session_exercise_memos[workoutId]?.[name];
  const content = entry.memo || entry.dirty ? entry.content : (cached?.content ?? "");
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (entry.phase === "error") setOpened(true);
  }, [entry.phase]);
  return (
    <div className="record-exercise-memo">
      <small>この種目のメモ</small>
      {opened ? (
        <InlineMemo
          title={title}
          path={path}
          initial={entry.memo ?? cached}
          userId={userId}
          active={active}
        />
      ) : (
        <button
          type="button"
          className="memo-text"
          aria-label={`${title}を開く`}
          onClick={() => setOpened(true)}
        >
          {content || "メモ"}
        </button>
      )}
    </div>
  );
}
