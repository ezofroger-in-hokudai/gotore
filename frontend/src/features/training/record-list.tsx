import type { Workout } from "@/lib/api";
import { dateLabel } from "../activity/calendar";
import { estimatedRM } from "../session/session";
import { BestFlame } from "./best-flame";
import { recordSummary } from "./record-summary";
import { ReuseWorkout } from "./reuse-workout";
import { WorkoutActions } from "./workout-actions";

import { WorkoutMemo } from "./workout-memo";

export function RecordList({
  records,
  userId,
  empty,
  personal = false,
  onReuse,
  onEdit,
  onDeleted,
}: {
  personal?: boolean;
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
        const summary = recordSummary(record);
        const own = personal && record.user_id === userId;
        return (
          <article className="record record-review" key={record.id}>
            <header className="record-heading">
              {!own && (
                <div className="record-author">
                  <span className="avatar" aria-hidden="true">
                    {record.display_name.slice(0, 1)}
                  </span>
                  <strong>{record.display_name}</strong>
                </div>
              )}
              <h2>
                <time dateTime={record.performed_on}>{dateLabel(record.performed_on)}</time>
              </h2>
              {record.started_at && !record.ended_at && <p className="muted">トレーニング中</p>}
              <dl className="record-overview">
                <div aria-label="総負荷">
                  <dt>総負荷</dt>
                  <dd>
                    <strong>
                      {summary.volume.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}
                    </strong>
                    <small>kg</small>
                  </dd>
                </div>
                <div aria-label="セット数">
                  <dt>セット</dt>
                  <dd>
                    <strong>{summary.sets}</strong>
                  </dd>
                </div>
                {summary.minutes !== null && (
                  <div aria-label="時間">
                    <dt>時間</dt>
                    <dd>
                      <strong>{summary.minutes}</strong>
                      <small>分</small>
                    </dd>
                  </div>
                )}
              </dl>
            </header>
            <div className="record-details">
              {record.exercises.map((exercise, index) => (
                <section className="record-exercise" key={`${index}-${exercise.name}`}>
                  <h3>{exercise.name}</h3>
                  <section
                    className="record-table-scroll"
                    aria-label={`${exercise.name}の全セット`}
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: 文字拡大時に表をキーボードで横スクロールする。
                    tabIndex={0}
                  >
                    <table className="record-table" aria-label={exercise.name}>
                      <thead>
                        <tr>
                          <th scope="col">セット</th>
                          <th scope="col">
                            重量 <small>kg</small>
                          </th>
                          <th scope="col">回数</th>
                          <th scope="col">
                            推定1RM <small>kg</small>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {exercise.sets.map((set, setIndex) => {
                          const best = bests.get(`${index}:${setIndex}`);
                          return (
                            <tr
                              className={`record-set${best ? " has-personal-best" : ""}`}
                              // biome-ignore lint/suspicious/noArrayIndexKey: 保存順で特定する読み取り専用のセット。
                              key={`${index}-${setIndex}`}
                            >
                              <th scope="row">
                                <span className="record-set-label">
                                  {setIndex + 1} {best && <BestFlame best={best} />}
                                </span>
                              </th>
                              <td>
                                <b className={best?.weight ? "personal-best-value" : undefined}>
                                  {set.weight}
                                </b>
                              </td>
                              <td>{set.reps}</td>
                              <td>
                                <b className={best?.rm ? "personal-best-value" : undefined}>
                                  {estimatedRM(set.weight, set.reps) ?? "—"}
                                </b>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </section>
                </section>
              ))}
            </div>
            {own && (
              <p className="record-sharing">
                {record.group_id || record.shared_group_ids?.length ? "共有済み" : "自分だけ"}
              </p>
            )}
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
        );
      })}
    </div>
  );
}
