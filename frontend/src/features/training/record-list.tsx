import type { Workout } from "@/lib/api";
import { HistoryScore } from "../score/history-score";
import { ScoreBadge, ScoreBreakdown } from "../score/score-display";
import { estimatedRM } from "../session/session";
import { ReuseWorkout } from "./reuse-workout";
import { WorkoutActions } from "./workout-actions";

import { WorkoutMemo } from "./workout-memo";

const savedAtFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

export function RecordList({
  records,
  userId,
  empty,
  personal = false,
  expanded = personal,
  onReuse,
  onEdit,
  onDeleted,
}: {
  personal?: boolean;
  expanded?: boolean;
  records: Workout[];
  userId?: string;
  empty: string;
  onReuse?: (record: Workout) => void;
  onEdit?: (record: Workout) => void;
  onDeleted?: () => void;
}) {
  if (!records.length)
    return (
      <div className="empty">
        <span className="empty-symbol">＋</span>
        <h2>記録なし</h2>
        {empty && <p>{empty}</p>}
      </div>
    );
  return (
    <div className="record-list">
      {records.map((record) => (
        <article className="panel record" key={record.id}>
          <div className="record-top">
            <span className="avatar">{record.display_name.slice(0, 1)}</span>
            <div className="grow">
              <strong>{record.display_name}</strong>
              {record.user_id === userId && <span className="you">YOU</span>}
              <p className="record-date">{record.performed_on.replaceAll("-", ".")}</p>
            </div>
            <span className="badge">
              {record.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)} SETS
            </span>
          </div>
          <h3 className="exercise-summary">
            {record.exercises.map((exercise) => exercise.name).join(" / ")}
          </h3>
          {record.score && (
            <div className="record-score">
              <ScoreBadge score={record.score} />
              <ScoreBreakdown score={record.score} />
            </div>
          )}
          {record.score && personal && record.user_id === userId && (
            <HistoryScore record={record} onChanged={onDeleted} />
          )}
          <details open={expanded}>
            <summary>セット詳細</summary>
            <div className="record-details">
              {record.exercises.map((exercise, index) => (
                <div key={`${index}-${exercise.name}`}>
                  <h4>{exercise.name}</h4>
                  {exercise.sets.map((set, setIndex) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 確定済みセットは保存順が変わらない。
                    <div className="record-set" key={`${index}-${setIndex}`}>
                      <span>SET {setIndex + 1}</span>
                      <strong>
                        {set.weight} <small>kg</small> × {set.reps}{" "}
                        <small>回 · RM {estimatedRM(set.weight, set.reps) ?? "—"}</small>
                      </strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
          <div className="record-footer">
            <span>
              {record.group_id || record.shared_group_ids?.length ? "共有済み" : "自分だけ"}
            </span>
            <time dateTime={record.created_at}>
              {savedAtFormatter.format(new Date(record.created_at))} 保存
            </time>
          </div>
          {record.user_id === userId && onReuse && (
            <ReuseWorkout record={record} onReuse={onReuse} />
          )}
          {record.user_id === userId && onEdit && onDeleted && (
            <WorkoutActions record={record} onEdit={onEdit} onDeleted={onDeleted} />
          )}

          {personal && record.user_id === userId && (
            <WorkoutMemo workoutId={record.id} userId={userId} />
          )}
        </article>
      ))}
    </div>
  );
}
