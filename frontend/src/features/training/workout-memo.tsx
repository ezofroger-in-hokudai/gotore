"use client";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import { LoadingState } from "../loading/loading-state";
import { useRecordSnapshot } from "../record-cache/record-snapshot-provider";
import { useMemoDelivery, useVisibleMemo } from "./memo-delivery-provider";
import type { Memo } from "./memo-draft";
import { MemoFeedback, memoNeedsReview } from "./memo-feedback";
export function WorkoutMemo({
  workoutId,
  active = true,
  userId,
  label = "全体メモ",
}: { workoutId: string; userId: string; label?: string; active?: boolean }) {
  const cache = useRecordSnapshot();
  const target = { path: `/workouts/${workoutId}/memo`, label };
  const { store } = useMemoDelivery();
  const entry = useVisibleMemo(target, active);
  const needsReview = memoNeedsReview(entry);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(false);
  useEffect(() => {
    if (entry.phase === "error" && needsReview) setOpen(true);
  }, [entry.phase, needsReview]);
  async function load(discard = false) {
    if (discard && entry.phase === "sending") return;
    if (!discard) {
      const cached = cache?.snapshot?.workout_memos[workoutId];
      if (cached) store.prime(target, cached);
    }
    setLoading(true);
    setError("");
    try {
      const value = await api<Memo>(target.path, {}, userId);
      if (discard) store.discard(target, value);
      else store.prime(target, value);
      setReload(false);
    } catch {
      setError("メモを開けません。");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="workout-memo">
      {!open ? (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setOpen(true);
            setReload(false);
            void load();
          }}
        >
          メモ
        </button>
      ) : (
        <>
          {entry.memo && (
            <div>
              <label htmlFor={`memo-${workoutId}`}>メモ</label>
              <textarea
                id={`memo-${workoutId}`}
                maxLength={1000}
                rows={5}
                value={entry.content}
                disabled={loading}
                onChange={(event) => {
                  store.edit(target, event.target.value);
                }}
              />
            </div>
          )}
          {loading && <LoadingState label="メモを読み込み中" compact />}
          <div className="memo-buttons">
            {entry.memo && (
              <button
                type="button"
                className="primary"
                disabled={loading}
                onClick={() => {
                  if (store.enqueue(target)) {
                    setOpen(false);
                  }
                }}
              >
                保存
              </button>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setOpen(false);
                setReload(false);
                setError("");
              }}
            >
              閉じる
            </button>
            <button
              type="button"
              className="text-button"
              disabled={loading || entry.phase === "sending"}
              onClick={() => {
                if (entry.memo) setReload(true);
                else void load();
              }}
            >
              {entry.memo ? "読み直す" : "再試行"}
            </button>
          </div>
          {reload && (
            <div className="notice">
              <p>入力を破棄して読み直しますか？</p>
              <button
                type="button"
                className="secondary"
                disabled={loading}
                onClick={() => setReload(false)}
              >
                キャンセル
              </button>{" "}
              <button
                type="button"
                className="secondary"
                disabled={loading}
                onClick={() => void load(true)}
              >
                破棄して読み直す
              </button>
            </div>
          )}
        </>
      )}
      {entry.phase === "sending" && <LoadingState label="メモを送信中" compact />}
      <MemoFeedback entry={entry} onRetry={() => store.retry(target)} disabled={loading} />
      {error && !entry.error && !entry.storageError && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
