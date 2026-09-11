import { type ScoreAxis, type ScoreWeights, api } from "@/lib/api";
import { useState } from "react";
import { useResource } from "../training/use-resource";
import { scoreLabels } from "./score-display";

type WeightsSetting = {
  current: ScoreWeights;
  latest_version: number;
  scheduled: (ScoreWeights & { effective_on: string }) | null;
};
export function GroupScoreWeights({ groupId, editable }: { groupId: string; editable: boolean }) {
  const setting = useResource<WeightsSetting>(`/groups/${groupId}/score-weights`, 0, false, true);
  const [editing, setEditing] = useState(false);
  return (
    <section className="group-score-weights">
      <h2>SCOREの配点</h2>
      {setting.data ? (
        <>
          <p className="muted">
            継続 {setting.data.current.c}% · 出力 {setting.data.current.i}% · 総負荷{" "}
            {setting.data.current.v}% · 目標 {setting.data.current.g}%
          </p>
          {setting.data.scheduled && (
            <p className="muted">
              {setting.data.scheduled.effective_on}から新しい配点を適用します。
            </p>
          )}
          {editable &&
            (editing ? (
              <WeightsForm
                data={setting.data}
                groupId={groupId}
                onSaved={() => {
                  setting.retry();
                  setEditing(false);
                }}
              />
            ) : (
              <button type="button" className="secondary full" onClick={() => setEditing(true)}>
                配点を変更
              </button>
            ))}
        </>
      ) : setting.error ? (
        <p role="alert" className="error">
          {setting.error}
          <button type="button" onClick={setting.retry}>
            再試行
          </button>
        </p>
      ) : (
        <p className="muted">配点を読み込み中…</p>
      )}
    </section>
  );
}
function WeightsForm({
  data,
  groupId,
  onSaved,
}: { data: WeightsSetting; groupId: string; onSaved: () => void }) {
  const initial = data.scheduled ?? data.current;
  const [weights, setWeights] = useState<ScoreWeights>({
    c: initial.c,
    i: initial.i,
    v: initial.v,
    g: initial.g,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || total !== 100) return;
        setBusy(true);
        setError("");
        try {
          await api(`/groups/${groupId}/score-weights`, {
            method: "PUT",
            body: JSON.stringify({ ...weights, expected_version: data.latest_version }),
          });
          onSaved();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "保存できませんでした。");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="weight-inputs">
        {(Object.keys(scoreLabels) as ScoreAxis[]).map((axis) => (
          <label key={axis}>
            {scoreLabels[axis]}（%）
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              required
              disabled={busy}
              value={weights[axis]}
              onChange={(e) => setWeights({ ...weights, [axis]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <p className="muted">合計 {total}% · 次の月曜日から適用します。</p>
      <button className="primary full" type="submit" disabled={busy || total !== 100}>
        {busy ? "保存中…" : "配点を保存"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
