import type { ScoreDetail, Workout } from "@/lib/api";
import { scoreAppearance } from "./score-colors";
import { ScoreBreakdown, scoreText } from "./score-display";

export function WorkoutResult({
  record,
  result,
  onRetry,
  onHistory,
  onHome,
}: {
  record: Workout;
  result?: { data: ScoreDetail | null; error: string; busy: boolean };
  onRetry: () => void;
  onHistory: () => void;
  onHome: () => void;
}) {
  const score = result?.data ?? record.score;
  const sets = record.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const volume = record.exercises.reduce(
    (sum, e) => sum + e.sets.reduce((v, s) => v + s.weight * s.reps, 0),
    0,
  );
  return (
    <section
      className="workout-result"
      aria-label="トレーニング結果"
      style={scoreAppearance(score?.status === "stale" ? null : score?.total)}
    >
      <p className="result-eyebrow">TRAINING COMPLETE</p>
      <h1>おつかれさまでした。</h1>
      <p className="muted">{record.performed_on.replaceAll("-", ".")} · 記録を保存しました</p>
      <div
        className={`result-score${score?.total != null ? " result-scored" : ""}`}
        aria-live="polite"
      >
        <span>TODAY’S SCORE</span>
        <strong>
          {score?.total != null && score.status !== "stale" ? (
            <>
              {score.total}
              <small>点</small>
            </>
          ) : score ? (
            scoreText(score)
          ) : (
            "—"
          )}
        </strong>
        <small>
          {score?.total != null ? "今日の積み重ねを、次の自分へ。" : "自分の実績への到達度"}
        </small>
      </div>
      <div className="result-totals">
        <span>
          <strong>{record.exercises.length}</strong> 種目
        </span>
        <span>
          <strong>{sets}</strong> セット
        </span>
        <span>
          <strong>{volume.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}</strong> kg 総負荷
        </span>
      </div>
      {score && <ScoreBreakdown score={score} />}
      {score?.total === null && (
        <p className="muted score-note">
          {score.components.c === null || score.components.i === null || score.components.v === null
            ? "比較できる記録がそろうと総合点が表示されます。"
            : score.status === "complete"
              ? "目標の評価に必要な記録を集めています。"
              : "目標の採点が終わると総合点が表示されます。"}
        </p>
      )}
      <div className="result-comment" aria-live="polite">
        <h2>目標への一言</h2>
        {result?.data?.goal && <p className="muted">{result.data.goal.body}</p>}
        {result?.data?.comment ? (
          <p>{result.data.comment}</p>
        ) : !score ? (
          <p className="muted">
            {sets === 0 ? "セットを記録するとスコアがつきます。" : "この記録はSCOREの対象外です。"}
          </p>
        ) : (
          <p className="muted">
            {result?.error ? "コメントは採点待ちです。" : "今日の取り組みを振り返っています…"}
          </p>
        )}
        {result?.error && (
          <div className="error" role="alert">
            <p>{result.error}</p>
            <button className="text-button" type="button" onClick={onRetry}>
              採点を再試行
            </button>
          </div>
        )}
      </div>
      <p className="muted score-note">目標とコメントは自分だけに表示されます。</p>
      <button type="button" className="primary full" onClick={onHome}>
        ホームへ
      </button>
      <button type="button" className="secondary full" onClick={onHistory}>
        履歴を見る
      </button>
    </section>
  );
}
