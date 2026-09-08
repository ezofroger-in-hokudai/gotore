"use client";

import { type ExerciseOption, api } from "@/lib/api";
import { type FormEvent, useState } from "react";

export function ExerciseCatalog({
  options,
  disabled,
  onChanged,
}: {
  options: ExerciseOption[];
  disabled: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<ExerciseOption | null>(null);
  const busy = disabled || pending;

  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const normalized = name.trim();
    if (!normalized || [...normalized].length > 60) {
      setError("種目名は前後の空白を除いて1〜60文字で入力してください。");
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      await api<ExerciseOption>("/exercise-options", {
        method: "POST",
        body: JSON.stringify({ name: normalized }),
      });
      setName("");
      setNotice(`「${normalized}」を追加しました。`);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "種目を追加できませんでした。");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (busy || !deleting) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await api<void>(`/exercise-options/${deleting.id}`, { method: "DELETE" });
      setNotice(`「${deleting.name}」をリストから削除しました。`);
      setDeleting(null);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "種目を削除できませんでした。");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="panel exercise-catalog">
      <summary>種目リスト</summary>

      <form onSubmit={add}>
        <fieldset disabled={busy}>
          <label>
            新しい種目
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <button className="secondary" type="submit">
            追加
          </button>
        </fieldset>
      </form>
      <ul className="exercise-options">
        {options.map((option) => (
          <li key={option.id}>
            <span>{option.name}</span>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              aria-label={`${option.name}をリストから削除`}
              onClick={() => {
                setDeleting(option);
                setError("");
                setNotice("");
              }}
            >
              削除
            </button>
          </li>
        ))}
      </ul>
      {deleting && (
        <fieldset className="notice" aria-label="種目リストからの削除確認">
          <p>「{deleting.name}」をリストから削除しますか？</p>
          <button type="button" className="secondary" disabled={busy} onClick={remove}>
            削除する
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setDeleting(null);
              setError("");
            }}
          >
            キャンセル
          </button>
        </fieldset>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <output className="notice">{notice}</output>}
    </details>
  );
}
