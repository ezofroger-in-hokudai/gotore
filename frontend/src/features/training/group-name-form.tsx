import { type Group, api } from "@/lib/api";
import { type FormEvent, useId, useRef, useState } from "react";
import { useInlineInputFocus } from "../settings/use-inline-input-focus";

export function GroupNameForm({
  group,
  onSaved,
  inline = false,
  onCancel,
}: { group: Group; onSaved: (group: Group) => void; inline?: boolean; onCancel?: () => void }) {
  const [name, setName] = useState(group.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useInlineInputFocus(inputRef, inline);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const value = name.trim();
    if (!value || Array.from(value).length > 40) {
      setError("グループ名は1〜40文字です。");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await api<Group>(`/groups/${group.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: value }),
      });
      setName(updated.name);
      onSaved(updated);
      if (!inline) setMessage("変更しました。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "変更できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  const input = (
    <input
      required
      ref={inputRef}
      id={inputId}
      aria-label={inline ? "グループ名" : undefined}
      maxLength={40}
      value={name}
      onChange={(event) => {
        setName(event.target.value);
        setError("");
        setMessage("");
      }}
    />
  );

  if (inline)
    return (
      <form className="group-name-inline-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          {input}
          <div className="group-name-inline-actions">
            <button type="button" className="text-button" onClick={onCancel}>
              キャンセル
            </button>
            <button type="submit" className="group-name-commit">
              決定
            </button>
          </div>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    );

  return (
    <form onSubmit={submit}>
      <h3>名前の変更</h3>
      <fieldset disabled={busy}>
        <label htmlFor={inputId}>
          変更後の名前
          {input}
        </label>
        <button type="submit" className="secondary full">
          {busy ? "変更中…" : "変更する"}
        </button>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <output className="notice">{message}</output>}
    </form>
  );
}
