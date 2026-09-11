import type { ScoreDetail, Workout } from "@/lib/api";
import { useState } from "react";
import { useResource } from "../training/use-resource";
import { Sheet } from "../v2/sheet";
import { ScoreBadge, ScoreBreakdown, scoreText } from "./score-display";
import { useScoring } from "./use-scoring";

export function HistoryScore({ record, onChanged }: { record: Workout; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [prepare, setPrepare] = useState(false);
  const resource = useResource<ScoreDetail | null>(
    `/workouts/${record.id}/score`,
    record.revision,
    open,
    true,
    { enabled: open, prefetch: prepare },
  );
  const scoring = useScoring(() => {
    resource.retry();
    onChanged?.();
  });
  const response = scoring.results[record.id];
  const data = resource.error
    ? null
    : response?.data?.revision === record.revision
      ? response.data
      : resource.data;
  const error = response?.error || resource.error;
  return (
    <>
      <button
        type="button"
        className="text-button score-history-button"
        onPointerEnter={() => setPrepare(true)}
        onFocus={() => setPrepare(true)}
        onClick={() => setOpen(true)}
        aria-label={`${record.performed_on}のスコア詳細`}
      >
        <ScoreBadge score={record.score} /> <span>内訳・一言</span>
      </button>
      {open && (
        <Sheet
          title="SCOREの振り返り"
          onClose={() => {
            setOpen(false);
            setPrepare(false);
          }}
        >
          {data ? (
            <>
              <p className="score-detail-total">{scoreText(data)}</p>
              <ScoreBreakdown score={data} />
              <h3>この日の目標</h3>
              <p>{data.goal.body}</p>
              <h3>目標への一言</h3>
              <p>
                {data.comment ??
                  (data.status === "stale"
                    ? "記録が変更されています。採点時の内容とは異なります。"
                    : "採点待ちです。")}
              </p>
              {data.judgments.length > 0 && (
                <details>
                  <summary>評価の理由</summary>
                  {data.goal.criteria.map((criterion, index) => (
                    <p key={criterion.text}>
                      <strong>{criterion.text}</strong>
                      <br />
                      {data.judgments[index]?.reason}
                    </p>
                  ))}
                </details>
              )}
              {data.baseline && (
                <p className="muted score-note">
                  比較元：{data.baseline.performed_on}の同じ種目構成の記録
                </p>
              )}
              <p className="muted score-note">
                採点時の評価です。目標とコメントは自分だけに表示されます。
              </p>
              {(data.status === "pending" || data.status === "processing") && (
                <button
                  className="secondary full"
                  type="button"
                  disabled={response?.busy}
                  onClick={() => void scoring.evaluate(record.id)}
                >
                  {response?.busy ? "採点中…" : "採点を再試行"}
                </button>
              )}
            </>
          ) : !error ? (
            <output className="muted">スコアを読み込み中…</output>
          ) : null}
          {error && (
            <p className="error" role="alert">
              {error}
              <button className="text-button" type="button" onClick={resource.retry}>
                読み直す
              </button>
            </p>
          )}
        </Sheet>
      )}
    </>
  );
}
