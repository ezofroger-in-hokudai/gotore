"use client";
import { type Workout, api } from "@/lib/api";
import { useState } from "react";
import { memoDraftKey, removeMemoDraft } from "./memo-draft";
export function WorkoutActions({
  record,
  onEdit,
  onDeleted,
}: {
  record: Workout;
  onEdit: (record: Workout) => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/workouts/${record.id}?expected_revision=${record.revision}`, {
        method: "DELETE",
      });
      removeMemoDraft(memoDraftKey(record.user_id, `/workouts/${record.id}/memo`));
      onDeleted();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "削除できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workout-actions">
      {confirming ? (
        <>
          <p>この記録を削除しますか？</p>
          <div className="action-buttons">
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              キャンセル
            </button>
            <button className="primary" type="button" disabled={busy} onClick={remove}>
              {busy ? "削除中…" : "削除する"}
            </button>
          </div>
        </>
      ) : (
        <div className="action-buttons">
          <button className="secondary" type="button" onClick={() => onEdit(record)}>
            編集
          </button>
          <button className="text-button" type="button" onClick={() => setConfirming(true)}>
            削除
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
