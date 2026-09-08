import type { Workout } from "@/lib/api";
import { ReuseWorkout } from "./reuse-workout";
import { WorkoutActions } from "./workout-actions";

export function RecordList({
  records,
  userId,
  empty,
  onReuse,
  onEdit,
  onDeleted,
}: {
  records: Workout[];
  userId: string;
  empty: string;
  onReuse?: (record: Workout) => void;
  onEdit?: (record: Workout) => void;
  onDeleted?: () => void;
}) {
  if (!records.length)
    return (
      <div className="empty">
        <span className="empty-symbol">＋</span>
        <h2>ここから、最初の一回。</h2>
        <p>{empty}</p>
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
              <p className="record-date">
                {record.performed_on.replaceAll("-", ".")} のトレーニング
              </p>
            </div>
            <span className="badge">
              {record.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)} SETS
            </span>
          </div>
          <h3 className="exercise-summary">
            {record.exercises.map((exercise) => exercise.name).join(" / ")}
          </h3>
          <details>
            <summary>セットの詳細を見る</summary>
            <div className="record-details">
              {record.exercises.map((exercise, index) => (
                <div key={`${index}-${exercise.name}`}>
                  <h4>{exercise.name}</h4>
                  {exercise.sets.map((set, setIndex) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 確定済みセットは保存順が変わらない。
                    <div className="record-set" key={`${index}-${setIndex}`}>
                      <span>SET {setIndex + 1}</span>
                      <strong>
                        {set.weight} <small>kg</small> × {set.reps} <small>回</small>
                      </strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
          <div className="record-footer">
            <span>{record.group_id ? "グループに共有済み" : "自分だけの記録"}</span>
            <time dateTime={record.created_at}>
              {new Intl.DateTimeFormat("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Tokyo",
              }).format(new Date(record.created_at))}{" "}
              保存
            </time>
          </div>
          {record.user_id === userId && onReuse && (<ReuseWorkout record={record} onReuse={onReuse} />)}
          {record.user_id === userId && onEdit && onDeleted && (
            <WorkoutActions record={record} onEdit={onEdit} onDeleted={onDeleted} />
          )}
        </article>
      ))}
    </div>
  );
}
