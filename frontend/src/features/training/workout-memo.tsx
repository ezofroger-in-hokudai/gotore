"use client";

import { api } from "@/lib/api";
import { useState } from "react";

type Memo = { content: string; revision: number };
export function WorkoutMemo({ workoutId }: { workoutId: string }) {
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState<Memo | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(false);
  const path = `/workouts/${workoutId}/memo`;
  async function load() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await api<Memo>(path);
      setMemo(value);
      setContent(value.content);
      setReload(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "メモを取得できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!memo || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await api<Memo>(path, {
        method: "PUT",
        body: JSON.stringify({ content, expected_revision: memo.revision }),
      });
      setMemo(value);
      setContent(value.content);
      setNotice("保存しました。");
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : "保存できませんでした。"}`);
    } finally {
      setBusy(false);
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
            setMemo(null);
            setContent("");
            setReload(false);
            void load();
          }}
        >
          メモ
        </button>
      ) : (
        <>
          {memo && (
            <div>
              <label htmlFor={`memo-${workoutId}`}>メモ</label>
              <textarea
                id={`memo-${workoutId}`}
                maxLength={1000}
                rows={5}
                value={content}
                disabled={busy}
                onChange={(event) => {
                  setContent(event.target.value);
                  setNotice("");
                }}
              />
            </div>
          )}
          {busy && <output>処理中…</output>}
          <div className="memo-buttons">
            {memo && (
              <button type="button" className="primary" disabled={busy} onClick={save}>
                保存
              </button>
            )}
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setMemo(null);
                setContent("");
                setError("");
                setNotice("");
              }}
            >
              閉じる
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (memo) setReload(true);
                else void load();
              }}
            >
              {memo ? "読み直す" : "再試行"}
            </button>
          </div>
          {reload && (
            <div className="notice">
              <p>入力を破棄して読み直しますか？</p>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setReload(false)}
              >
                キャンセル
              </button>{" "}
              <button type="button" className="secondary" disabled={busy} onClick={load}>
                破棄して読み直す
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <output className="notice">{notice}</output>}
    </div>
  );
}
