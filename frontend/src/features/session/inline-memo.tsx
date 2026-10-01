import { api } from "@/lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoadingState } from "../loading/loading-state";
import { useRecordSnapshot } from "../record-cache/record-snapshot-provider";
import { useMemoDelivery, useVisibleMemo } from "../training/memo-delivery-provider";
import type { Memo, MemoDraftState } from "../training/memo-draft";
import { MemoFeedback, memoNeedsReview } from "../training/memo-feedback";

export function InlineMemo({
  title,
  active = true,
  path,
  initial,
  name,
  userId,
  onSaved,
  onDraftChange,
  omitWhenEmpty = false,
  singleLine = false,
}: {
  title: string;
  active?: boolean;
  path: string;
  initial?: Memo;
  name?: string;
  userId: string;
  onSaved?: () => void;
  onDraftChange?: (state: MemoDraftState) => void;
  omitWhenEmpty?: boolean;
  singleLine?: boolean;
}) {
  const cache = useRecordSnapshot();
  const target = useMemo(
    () => ({
      path,
      name,
      label: name
        ? `${name}の種目メモ`
        : `${decodeURIComponent(path.split("name=")[1] ?? "")}の${title}`,
    }),
    [path, name, title],
  );
  const { store } = useMemoDelivery();
  const entry = useVisibleMemo(target, active);
  const needsReview = memoNeedsReview(entry);
  const sessionMemo = path.match(/^\/sessions\/([^/]+)\/exercise-memo\?name=(.+)$/);
  const cached = sessionMemo
    ? cache?.snapshot?.session_exercise_memos[sessionMemo[1]]?.[decodeURIComponent(sessionMemo[2])]
    : undefined;
  const [editing, setEditing] = useState(entry.dirty);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const previousPhase = useRef(entry.phase);
  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (entry.phase === "error" && needsReview) setEditing(true);
    if (previousPhase.current === "sending" && entry.phase === "idle" && !entry.queue.length) {
      if (!entry.dirty) setEditing(false);
      onSaved?.();
    }
    previousPhase.current = entry.phase;
  }, [entry.phase, needsReview, entry.queue.length, entry.dirty, onSaved]);
  const draftState: MemoDraftState = entry.dirty
    ? entry.storageError
      ? "memory"
      : "stored"
    : "saved";
  useEffect(() => onDraftChange?.(draftState), [draftState, onDraftChange]);
  useEffect(() => {
    if (initial) {
      store.prime(target, initial);
      return;
    }
    if (cached) store.prime(target, cached);
    const controller = new AbortController();
    void api<Memo>(path, { signal: controller.signal }, userId)
      .then((value) => {
        if (!controller.signal.aborted) {
          store.prime(target, value);
          setLoadError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError("メモを取得できません");
      });
    return () => controller.abort();
  }, [initial, cached, path, userId, store, target]);
  async function reload() {
    if (entry.phase === "sending") return;
    if (entry.dirty && !window.confirm("入力中のメモを破棄して読み直しますか？")) return;
    setLoading(true);
    try {
      const value = name
        ? (
            await api<{ memo: Memo }>(
              `/exercises/context?name=${encodeURIComponent(name)}`,
              {},
              userId,
            )
          ).memo
        : await api<Memo>(path, {}, userId);
      store.discard(target, value);
      setLoadError("");
    } catch {
      setLoadError("メモを取得できません");
    } finally {
      setLoading(false);
    }
  }
  const error = entry.error || loadError;
  if (omitWhenEmpty && !entry.content.trim() && !editing && !error && !entry.dirty) return null;
  return (
    <form
      className={`inline-memo${singleLine ? " single-line" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!entry.memo || loading) return;
        if (store.enqueue(target)) setEditing(false);
      }}
    >
      {!editing ? (
        <button
          type="button"
          className="memo-text"
          aria-label={`${title}を編集`}
          disabled={!entry.memo}
          onClick={() => setEditing(true)}
        >
          {entry.content.trim() ? entry.content : "メモ"}
        </button>
      ) : (
        <textarea
          id={`memo-${userId}-${name ?? path}`}
          aria-label={title}
          maxLength={1000}
          rows={singleLine ? 1 : 2}
          wrap={singleLine ? "off" : undefined}
          disabled={loading || !entry.memo}
          placeholder="メモ"
          value={entry.content}
          ref={field}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
          onBlur={(event) => {
            if (
              event.relatedTarget instanceof HTMLElement &&
              event.currentTarget.form?.contains(event.relatedTarget)
            )
              return;
            if (entry.dirty && !loading && entry.memo) event.currentTarget.form?.requestSubmit();
          }}
          onChange={(event) => store.edit(target, event.target.value)}
        />
      )}
      {entry.phase === "sending" && <LoadingState label="メモを送信中" compact />}
      <MemoFeedback
        entry={entry}
        onRetry={() => store.retry(target)}
        onReload={() => void reload()}
        disabled={loading}
      />
      {loadError && !entry.error && !entry.storageError && (
        <p className="error" role="alert">
          メモを開けません。
          <button
            type="button"
            className="text-button"
            disabled={loading || entry.phase === "sending"}
            onClick={() => void reload()}
          >
            再試行
          </button>
        </p>
      )}
    </form>
  );
}
