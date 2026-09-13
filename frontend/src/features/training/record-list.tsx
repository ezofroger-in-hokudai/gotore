import type { Workout } from "@/lib/api";
import { estimatedRM } from "../session/session";
import { BestFlame } from "./best-flame";
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
      {records.map((record) => {
        const bests = new Map(
          (record.best_sets ?? []).map((best) => [
            `${best.exercise_index}:${best.set_index}`,
            best,
          ]),
        );
        return (
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

            <details open={expanded}>
              <summary>セット詳細</summary>
              <div className="record-details">
                {record.exercises.map((exercise, index) => (
                  <div key={`${index}-${exercise.name}`}>
                    <h4>{exercise.name}</h4>
                    {exercise.sets.map((set, setIndex) => {
                      const best = bests.get(`${index}:${setIndex}`);
                      return (
                        <div
                          className={`record-set${best ? " has-personal-best" : ""}`}
                          // biome-ignore lint/suspicious/noArrayIndexKey: 保存順で特定する読み取り専用のセット。
                          key={`${index}-${setIndex}`}
                        >
                          <span className="record-set-label">
                            SET {setIndex + 1} {best && <BestFlame best={best} />}
                          </span>
                          <strong>
                            <b className={best?.weight ? "personal-best-value" : undefined}>
                              {set.weight}
                            </b>{" "}
                            <small>kg</small> × {set.reps}{" "}
                            <small>
                              回 · RM{" "}
                              <b className={best?.rm ? "personal-best-value" : undefined}>
                                {estimatedRM(set.weight, set.reps) ?? "—"}
                              </b>
                            </small>
                          </strong>
                        </div>
                      );
                    })}
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

            {personal && record.user_id === userId && <WorkoutMemo workoutId={record.id} />}
          </article>
        );
      })}
    </div>
  );
}
