import { type Group, api } from "@/lib/api";
import { type FormEvent, useState } from "react";

export function GroupNameForm({
  group,
  onSaved,
}: { group: Group; onSaved: (group: Group) => void }) {
  const [name, setName] = useState(group.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
      setMessage("変更しました。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "変更できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h3>名前の変更</h3>
      <fieldset disabled={busy}>
        <label>
          変更後の名前
          <input
            required
            maxLength={40}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
              setMessage("");
            }}
          />
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
