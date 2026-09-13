import type { Workout } from "@/lib/api";

export function WorkoutResult({
  record,
  onHistory,
  onHome,
}: {
  record: Workout;
  onHistory: () => void;
  onHome: () => void;
}) {
  const sets = record.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const volume = record.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.reduce((total, set) => total + set.weight * set.reps, 0),
    0,
  );
  return (
    <section className="workout-result" aria-label="トレーニング結果">
      <h1>おつかれさまでした。</h1>
      <p className="muted">{record.performed_on.replaceAll("-", ".")} · 保存済み</p>
      <div className="result-volume" aria-label="総負荷量">
        <span>総負荷</span>
        <strong>
          {volume.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}
          <small>kg</small>
        </strong>
      </div>
      <div className="result-totals">
        <span>
          <strong>{record.exercises.length}</strong> 種目
        </span>
        <span>
          <strong>{sets}</strong> セット
        </span>
      </div>
      <button type="button" className="primary full" onClick={onHome}>
        ホーム
      </button>
      <button type="button" className="text-button full" onClick={onHistory}>
        履歴
      </button>
    </section>
  );
}
