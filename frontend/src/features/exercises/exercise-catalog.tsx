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
      setNotice(`「${normalized}」をリストに追加しました。同名の種目はひとつにまとまります。`);
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
      setNotice(`「${deleting.name}」をリストから削除しました。記録と下書きは残っています。`);
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
      <summary>自分の種目リストを管理</summary>
      <p className="muted">自分だけの候補です。追加した種目は記録欄から選べます。</p>
      <form onSubmit={add}>
        <fieldset disabled={busy}>
          <label>
            追加する種目名
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <button className="secondary" type="submit">
            リストに追加
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
          <p>
            「{deleting.name}」をリストから削除しますか？ 過去の記録と入力中の下書きは残ります。
          </p>
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
