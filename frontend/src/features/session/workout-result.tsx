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
      <p className="result-eyebrow">TRAINING COMPLETE</p>
      <h1>おつかれさまでした。</h1>
      <p className="muted">{record.performed_on.replaceAll("-", ".")} · 記録を保存しました</p>
      <div className="result-volume" aria-label="総負荷量">
        <span>TOTAL VOLUME</span>
        <strong>
          {volume.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}
          <small>kg</small>
        </strong>
        <small>今日の積み重ねを、次の自分へ。</small>
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
        ホームへ
      </button>
      <button type="button" className="text-button full" onClick={onHistory}>
        履歴を確認する
      </button>
    </section>
  );
}
