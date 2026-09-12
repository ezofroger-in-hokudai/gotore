import type { Workout } from "@/lib/api";
import { dateLabel } from "../activity/calendar";
import { number } from "../analytics/chart";
import type { useResource } from "../training/use-resource";
import { estimatedRM } from "./session";

const volume = (record: Workout) =>
  record.exercises.reduce(
    (total, exercise) => total + exercise.sets.reduce((sum, set) => sum + set.weight * set.reps, 0),
    0,
  );

export function TrainingOverview({
  resource,
  onHistory,
}: {
  resource: ReturnType<typeof useResource<Workout[]>>;
  onHistory: () => void;
}) {
  const records = resource.data
    ?.filter(
      (record) =>
        (!record.started_at || record.ended_at) &&
        record.exercises.some((exercise) => exercise.sets.length),
    )
    .slice(0, 10);
  const latest = records?.[0];
  const points = records?.toReversed() ?? [];
  const max = Math.max(1, ...points.map(volume));
  const x = (index: number) => 38 + (index * 260) / Math.max(1, points.length - 1);
  const y = (value: number) => 88 - (value / max) * 66;
  return (
    <section className="training-overview" aria-label="これまでのトレーニング">
      {resource.error ? (
        <div role="alert">
          <p>{resource.error}</p>
          <button className="text-button" type="button" onClick={resource.retry}>
            再試行
          </button>
        </div>
      ) : !records ? (
        <output className="muted">前回の記録を読み込み中…</output>
      ) : !latest ? (
        <p className="muted">最初のトレーニングを記録してみましょう。</p>
      ) : (
        <>
          <div className="section-heading">
            <h2>前回のトレーニング</h2>
            <span className="muted">
              {resource.loading ? "更新中…" : dateLabel(latest.performed_on)}
            </span>
          </div>
          <p className="training-overview-total">
            <strong>{number(volume(latest))}</strong> kg 総負荷 ·{" "}
            {latest.exercises.reduce((count, e) => count + e.sets.length, 0)}セット
          </p>
          <dl className="training-overview-exercises">
            {latest.exercises
              .filter((exercise) => exercise.sets.length)
              .slice(0, 3)
              .map((exercise, index) => {
                const rms = exercise.sets.flatMap((set) => {
                  const rm = estimatedRM(set.weight, set.reps);
                  return rm === null ? [] : [rm];
                });
                return (
                  <div key={`${exercise.name}-${index}`}>
                    <dt>{exercise.name}</dt>
                    <dd>
                      {exercise.sets.length}セット · 最高{" "}
                      {number(Math.max(...exercise.sets.map((set) => set.weight)))}kg · 推定1RM{" "}
                      {number(rms.length ? Math.max(...rms) : null)}
                      {rms.length ? "kg" : ""}
                    </dd>
                  </div>
                );
              })}
          </dl>
          {latest.exercises.length > 3 && (
            <p className="muted">ほか{latest.exercises.length - 3}種目</p>
          )}
          <figure className="training-volume-trend">
            <figcaption>最近{points.length}回の総負荷</figcaption>
            <svg viewBox="0 0 320 112" role="img" aria-label="最近のトレーニングごとの総負荷の推移">
              <title>
                終了した記録を古い順につないだ総負荷。詳しい数値は履歴から確認できます。
              </title>
              <line x1="38" x2="300" y1="88" y2="88" className="chart-grid" />
              <text x="30" y="26" textAnchor="end">
                {max === 1 && points.every((p) => volume(p) === 0) ? "0" : number(max)}
              </text>
              <path
                d={points
                  .map((record, i) => `${i ? "L" : "M"}${x(i)},${y(volume(record))}`)
                  .join(" ")}
                fill="none"
                className="chart-line"
              />
              {points.map((record, i) => (
                <circle
                  key={record.id}
                  cx={x(i)}
                  cy={y(volume(record))}
                  r="3"
                  className="chart-dot"
                />
              ))}
              <text x="38" y="106">
                {points[0]?.performed_on.slice(5).replace("-", "/")}
              </text>
              <text x="298" y="106" textAnchor="end">
                {latest.performed_on.slice(5).replace("-", "/")}
              </text>
            </svg>
          </figure>
        </>
      )}
      <button className="text-button" type="button" onClick={onHistory}>
        履歴・グラフを見る ›
      </button>
    </section>
  );
}
