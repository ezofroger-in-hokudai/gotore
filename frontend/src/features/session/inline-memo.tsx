import { api } from "@/lib/api";
import { useEffect, useRef, useState } from "react";

type Memo = { content: string; revision: number };
export function InlineMemo({
  title,
  path,
  initial,
  name,
  userId,
  onSaved,
}: {
  title: string;
  path: string;
  initial?: Memo;
  name?: string;
  userId: string;
  onSaved?: () => void;
}) {
  const key = `gotore:memo-input:v1:${userId}:${name ?? path}`;
  const [draft] = useState<Memo | null>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value.content === "string" && Number.isInteger(value.revision)
        ? value
        : null;
    } catch {
      return null;
    }
  });
  const [memo, setMemo] = useState<Memo | null>(draft ?? initial ?? null);
  const [content, setContent] = useState(draft?.content ?? initial?.content ?? "");
  const dirty = useRef(!!draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
      localStorage.removeItem(key);
      setError("");
    } catch {
      setError("メモを取得できません");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="inline-memo"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!memo || busy) return;
        setBusy(true);
        setError("");
        setNotice("");
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
          localStorage.removeItem(key);
          setNotice("保存済み");
          onSaved?.();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "保存できません");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="inline-memo-heading">
        <label htmlFor={key}>{title}</label>
        <span aria-live="polite">{notice}</span>
        <button
          className="text-button"
          type="submit"
          disabled={!memo || busy}
          aria-label={`${title}を保存`}
        >
          {busy ? "保存中" : "保存"}
        </button>
      </div>
      <textarea
        id={key}
        aria-label={title}
        maxLength={1000}
        rows={1}
        disabled={busy || !memo}
        placeholder="自分だけのメモ"
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          dirty.current = true;
          setNotice("");
          try {
            localStorage.setItem(
              key,
              JSON.stringify({ content: event.target.value, revision: memo?.revision ?? 0 }),
            );
          } catch {
            setError("端末へ保持できません。メモを保存してください。");
          }
        }}
      />
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
