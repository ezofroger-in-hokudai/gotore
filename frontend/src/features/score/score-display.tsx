import type { ScoreAxis, ScoreSummary } from "@/lib/api";
import { scoreAppearance } from "./score-colors";

export const scoreLabels: Record<ScoreAxis, string> = {
  c: "継続",
  i: "出力",
  v: "総負荷",
  g: "目標",
};

export function scoreText(score: ScoreSummary) {
  return score.status === "stale"
    ? "記録変更あり"
    : score.total !== null
      ? `${score.total}点`
      : "計測中";
}

export function ScoreBadge({ score }: { score?: ScoreSummary | null }) {
  if (!score) return null;
  return (
    <span
      className="score-badge"
      data-score={score.status === "stale" ? "pending" : (score.total ?? "pending")}
      style={scoreAppearance(score.status === "stale" ? null : score.total)}
    >
      <span>SCORE</span> <strong>{scoreText(score)}</strong>
    </span>
  );
}

export function ScoreBreakdown({ score }: { score: ScoreSummary }) {
  return (
    <div className="score-breakdown" aria-label="スコアの内訳">
      {(Object.keys(scoreLabels) as ScoreAxis[]).map((axis) => {
        const value = score.components[axis];
        return (
          <div key={axis}>
            <span>{scoreLabels[axis]}</span>
            <strong>
              {value === null ? "—" : Math.round(value)}
              <small>{value === null ? "" : "点"}</small>
            </strong>
            <div className="score-track" aria-hidden="true">
              <span style={{ width: `${value ?? 0}%` }} />
            </div>
            <small>
              {value === null
                ? axis === "g" && score.status !== "complete"
                  ? "採点待ち"
                  : "計測中"
                : `配点 ${score.weights[axis]}%`}
            </small>
          </div>
        );
      })}
    </div>
  );
}
