import { api } from "@/lib/api";
import { useEffect, useRef, useState } from "react";

import {
  type Memo,
  type MemoDraftState,
  memoDraftKey,
  readMemoDraft,
  removeMemoDraft,
} from "../training/memo-draft";
export function InlineMemo({
  title,
  path,
  initial,
  name,
  userId,
  onSaved,
  onDraftChange,
  omitWhenEmpty = false,
}: {
  title: string;
  path: string;
  initial?: Memo;
  name?: string;
  userId: string;
  onSaved?: () => void;
  onDraftChange?: (state: MemoDraftState) => void;
  omitWhenEmpty?: boolean;
}) {
  const key = memoDraftKey(userId, name ?? path);
  const [draft] = useState(() => readMemoDraft(key));
  const [draftState, setDraftState] = useState<MemoDraftState>(draft ? "stored" : "saved");
  useEffect(() => onDraftChange?.(draftState), [onDraftChange, draftState]);
  const [memo, setMemo] = useState<Memo | null>(draft ?? initial ?? null);
  const [content, setContent] = useState(draft?.content ?? initial?.content ?? "");
  const dirty = useRef(!!draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(!!draft);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (initial) {
      if (!dirty.current) {
        setMemo(initial);
        setContent(initial.content);
      }
      return;
    }
    let stopped = false;
    void api<Memo>(path)
      .then((value) => {
        if (!stopped) {
          if (!dirty.current) {
            setMemo(value);
            setContent(value.content);
          }
        }
      })
      .catch(() => {
        if (!stopped) setError("メモを取得できません");
      });
    return () => {
      stopped = true;
    };
  }, [initial, path]);
  async function reload() {
    if (dirty.current && !window.confirm("入力中のメモを破棄して読み直しますか？")) return;
    setBusy(true);
    try {
      const value = name
        ? (await api<{ memo: Memo }>(`/exercises/context?name=${encodeURIComponent(name)}`)).memo
        : await api<Memo>(path);
      setMemo(value);
      setContent(value.content);
      dirty.current = false;
      setDraftState("saved");
      setError(removeMemoDraft(key) ? "" : "読み直しましたが、端末の下書きを消去できません。");
    } catch {
      setError("メモを取得できません");
    } finally {
      setBusy(false);
    }
  }
  if (omitWhenEmpty && !content.trim() && !editing && !error && !dirty.current) return null;
  return (
    <form
      className="inline-memo"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!memo || busy) return;
        setBusy(true);
        setError("");
        const sent = content;
        try {
          const saved = await api<Memo>(path, {
            method: "PUT",
            body: JSON.stringify({
              ...(name ? { name } : {}),
              content: sent,
              expected_revision: memo.revision,
            }),
          });
          setMemo(saved);
          dirty.current = false;
          setDraftState("saved");
          if (!removeMemoDraft(key)) setError("保存しましたが、端末の下書きを消去できません。");
          setEditing(false);
          onSaved?.();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "保存できません");
        } finally {
          setBusy(false);
        }
      }}
    >
      {!editing ? (
        <button
          type="button"
          className="memo-text"
          aria-label={`${title}を編集`}
          disabled={!memo}
          onClick={() => setEditing(true)}
        >
          {content.trim() ? content : "メモ"}
        </button>
      ) : (
        <>
          <textarea
            id={key}
            aria-label={title}
            maxLength={1000}
            rows={2}
            disabled={busy || !memo}
            placeholder="メモ"
            value={content}
            ref={field}
            onChange={(event) => {
              setContent(event.target.value);
              dirty.current = true;
              try {
                localStorage.setItem(
                  key,
                  JSON.stringify({ content: event.target.value, revision: memo?.revision ?? 0 }),
                );
                setDraftState("stored");
              } catch {
                setDraftState("memory");
                setError("端末へ保持できません。メモを保存してください。");
              }
            }}
          />
          <div className="memo-actions">
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              閉じる
            </button>
            <button
              className="text-button"
              type="submit"
              disabled={!memo || busy}
              aria-label={`${title}を保存`}
            >
              {busy ? "保存中" : "保存"}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
          <button type="button" className="text-button" onClick={() => void reload()}>
            読み直す
          </button>
        </p>
      )}
    </form>
  );
}
