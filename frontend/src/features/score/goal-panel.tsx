import { type TrainingGoal, api } from "@/lib/api";
import { useState } from "react";

type Proposal = { criteria: TrainingGoal["criteria"]; questions: string[] };

export function GoalPanel({
  goal,
  onSaved,
}: { goal: TrainingGoal; onSaved: (goal: TrainingGoal) => void }) {
  const [body, setBody] = useState(goal.body);
  const [criteria, setCriteria] = useState(() =>
    goal.criteria.map((c) => ({ ...c, key: crypto.randomUUID() })),
  );
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [stage, setStage] = useState<"write" | "review">("write");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  async function propose() {
    if (busy || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      const value = await api<Proposal>("/me/goal/proposal", {
        method: "POST",
        body: JSON.stringify({ body }),
        signal: AbortSignal.timeout(25_000),
      });
      setProposal(value);
      setCriteria(value.criteria.map((c) => ({ ...c, key: crypto.randomUUID() })));
      setConfirmed(false);
      setStage(value.questions.length ? "write" : "review");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提案を取得できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  async function save(standard = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const value = await api<TrainingGoal>(standard ? "/me/goal/reset" : "/me/goal", {
        method: standard ? "POST" : "PUT",
        body: JSON.stringify(
          standard
            ? { expected_version: goal.version }
            : {
                expected_version: goal.version,
                body,
                criteria: criteria.map(({ text, observation_days }) => ({
                  text,
                  observation_days,
                })),
                is_standard: false,
              },
        ),
      });
      onSaved(value);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="goal-panel">
      <p className="muted">変更した目標は、次のトレーニングから使います。</p>
      {stage === "write" ? (
        <>
          <label>
            自分の目標
            <textarea
              maxLength={500}
              rows={3}
              value={body}
              disabled={busy}
              onChange={(e) => {
                setBody(e.target.value);
                setProposal(null);
              }}
            />
          </label>
          {proposal?.questions.length ? (
            <div className="goal-questions">
              <p>目標に追記してください</p>
              <ul>
                {proposal.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="muted">例：背中を中心に鍛えたい。毎回、背中の種目を1つは入れる。</p>
          {body === goal.body && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setConfirmed(false);
                setStage("review");
              }}
            >
              現在の評価基準を確認・修正
            </button>
          )}
          <p className="muted score-note">
            目標をOpenAIへ送り、評価基準を提案します。採点では、この目標での直近30日以内の記録も使います。
          </p>
          <button
            type="button"
            className="primary full"
            disabled={busy || !body.trim()}
            onClick={() => void propose()}
          >
            {busy ? "提案を作成中…" : "AIに評価基準を提案してもらう"}
          </button>
          <button
            type="button"
            className="secondary full"
            disabled={busy}
            onClick={() => void save(true)}
          >
            標準目標を使う
          </button>
        </>
      ) : (
        <>
          <p>{body}</p>
          <h3>評価基準を確認</h3>
          <p className="muted">目標に合わない条件は修正できます。</p>
          {criteria.map((criterion, index) => (
            <div className="goal-criterion" key={criterion.key}>
              <label>
                条件 {index + 1}
                <textarea
                  maxLength={240}
                  rows={2}
                  disabled={busy}
                  value={criterion.text}
                  onChange={(e) => {
                    setCriteria(
                      criteria.map((c, i) => (i === index ? { ...c, text: e.target.value } : c)),
                    );
                    setConfirmed(false);
                  }}
                />
              </label>
              <label>
                確認する期間
                <select
                  disabled={busy}
                  value={criterion.observation_days}
                  onChange={(e) => {
                    setCriteria(
                      criteria.map((c, i) =>
                        i === index ? { ...c, observation_days: Number(e.target.value) } : c,
                      ),
                    );
                    setConfirmed(false);
                  }}
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((days) => (
                    <option key={days} value={days}>
                      {days === 1 ? "今回のトレーニング" : `${days}日間`}
                    </option>
                  ))}
                </select>
              </label>
              {criteria.length > 2 && (
                <button
                  className="text-button"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCriteria(criteria.filter((_, i) => i !== index));
                    setConfirmed(false);
                  }}
                >
                  この条件を削除
                </button>
              )}
            </div>
          ))}
          {criteria.length < 4 && (
            <button
              type="button"
              className="secondary full"
              disabled={busy}
              onClick={() => {
                setCriteria([
                  ...criteria,
                  { text: "", observation_days: 1, key: crypto.randomUUID() },
                ]);
                setConfirmed(false);
              }}
            >
              条件を追加
            </button>
          )}
          <label className="goal-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            この条件で評価することを確認しました
          </label>
          <button
            className="primary full"
            type="button"
            disabled={busy || !confirmed || criteria.some((c) => !c.text.trim())}
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "この目標で保存"}
          </button>
          <button
            className="secondary full"
            type="button"
            disabled={busy}
            onClick={() => setStage("write")}
          >
            目標を書き直す
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
