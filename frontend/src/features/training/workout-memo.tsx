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
      setNotice("自分用メモを保存しました。");
    } catch (reason) {
      setError(
        `${reason instanceof Error ? reason.message : "保存できませんでした。"} 入力内容は残っています。`,
      );
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
          自分用メモ
        </button>
      ) : (
        <>
          <h4>自分用メモ</h4>
          <p className="muted">
            自分だけが読めます。グループには共有されません。空欄を保存すると内容を消去します。
          </p>
          <p className="muted">閉じると未保存の入力は消えます。</p>
          {memo && (
            <div>
              <label htmlFor={`memo-${workoutId}`}>メモ（1000文字まで）</label>
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
          {busy && <output>メモを処理しています…</output>}
          <div className="memo-buttons">
            {memo && (
              <button type="button" className="primary" disabled={busy} onClick={save}>
                メモを保存
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
              {memo ? "保存済みを読み直す" : "取得を再試行"}
            </button>
          </div>
          {reload && (
            <div className="notice">
              <p>未保存の入力を破棄して、保存済みのメモを読み直しますか？</p>
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
