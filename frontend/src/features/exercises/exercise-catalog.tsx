"use client";

import { ApiError, type BodyPartSelection, type ExerciseOption, api } from "@/lib/api";
import { type FormEvent, useId, useState } from "react";
import { BodyPartFields, BodyPartTags } from "./body-part-fields";
import { type BodyPartFilter, PART_FILTERS, filterExercises, optionParts } from "./body-parts";
import type { CatalogChange } from "./use-exercise-catalog";

const emptyParts: BodyPartSelection = { primary_body_part: "other", secondary_body_parts: [] };

export function ExerciseCatalog({
  options,
  disabled,
  onChanged,
  expanded = false,
  startAdding = false,
}: {
  options: ExerciseOption[];
  disabled: boolean;
  onChanged: (change?: CatalogChange) => void;
  expanded?: boolean;
  startAdding?: boolean;
}) {
  const [adding, setAdding] = useState(startAdding || options.length === 0);
  const [query, setQuery] = useState("");
  const [part, setPart] = useState<BodyPartFilter>("all");
  const formId = useId();
  const visible = filterExercises(options, part, query);
  const [name, setName] = useState("");
  const [parts, setParts] = useState<BodyPartSelection>(emptyParts);
  const [editing, setEditing] = useState<ExerciseOption | null>(null);
  const [editParts, setEditParts] = useState<BodyPartSelection>(emptyParts);
  const [conflict, setConflict] = useState(false);
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
      setError("種目名は1〜60文字です。");
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<ExerciseOption>("/exercise-options", {
        method: "POST",
        body: JSON.stringify({ name: normalized, ...parts }),
      });
      setName("");
      setParts(emptyParts);
      setNotice("追加しました。");
      setAdding(false);
      onChanged({ saved });
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
      setNotice("削除しました。");
      setDeleting(null);
      onChanged({ deleted: deleting.id });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "種目を削除できませんでした。");
    } finally {
      setPending(false);
    }
  }

  function edit(option: ExerciseOption) {
    setEditing(option);
    setEditParts(optionParts(option));
    setError("");
    setNotice("");
    setConflict(false);
    setDeleting(null);
  }

  async function reloadParts() {
    if (!editing || busy) return;
    setPending(true);
    setError("");
    try {
      const latest = await api<ExerciseOption[]>("/exercise-options");
      const found = latest.find((option) => option.id === editing.id);
      if (!found)
        throw new Error(
          "この種目はリストから削除されています。編集を閉じて一覧を読み直してください。",
        );
      edit(found);
      onChanged({ saved: found });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "部位を読み込めませんでした。");
    } finally {
      setPending(false);
    }
  }

  async function saveParts(event: FormEvent) {
    event.preventDefault();
    if (!editing || busy || conflict || editing.revision === undefined) return;
    setPending(true);
    setError("");
    try {
      const saved = await api<ExerciseOption>(`/exercise-options/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...editParts, expected_revision: editing.revision }),
      });
      setEditing(null);
      setNotice("部位を保存しました。");
      onChanged({ saved });
    } catch (reason) {
      setConflict(reason instanceof ApiError && (reason.status === 409 || reason.status === 404));
      setError(reason instanceof Error ? reason.message : "部位を保存できませんでした。");
    } finally {
      setPending(false);
    }
  }

  if (editing)
    return (
      <section className="body-part-editor" aria-label="部位を編集">
        <h3>{editing.name}</h3>
        <form onSubmit={saveParts}>
          <fieldset disabled={busy}>
            <BodyPartFields value={editParts} onChange={setEditParts} />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {(conflict || editing.revision === undefined) && (
              <div className="notice">
                <p>入力中の部位を置き換えて、最新の分類を読み直します。</p>
                <button type="button" className="secondary full" onClick={reloadParts}>
                  最新の部位を読み直す
                </button>
              </div>
            )}
            <button
              type="submit"
              className="primary full"
              disabled={conflict || editing.revision === undefined}
            >
              {pending ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              className="text-button full"
              onClick={() => {
                setEditing(null);
                setError("");
              }}
            >
              キャンセル
            </button>
          </fieldset>
        </form>
      </section>
    );

  return (
    <details className="panel exercise-catalog" open={expanded || undefined} aria-label="種目一覧">
      <summary hidden={expanded}>種目リスト</summary>

      <div className="catalog-toolbar">
        <input
          type="search"
          aria-label="種目名で検索"
          placeholder="種目名で検索"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setDeleting(null);
          }}
        />
        <button
          type="button"
          className="secondary"
          disabled={busy}
          aria-expanded={adding}
          aria-controls={formId}
          onClick={() => setAdding((value) => !value)}
        >
          種目を追加
        </button>
      </div>
      {adding && (
        <form id={formId} onSubmit={add}>
          <fieldset disabled={busy}>
            <label>
              新しい種目
              <input required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <BodyPartFields value={parts} onChange={setParts} />
            <button className="secondary" type="submit">
              追加
            </button>
          </fieldset>
        </form>
      )}
      <fieldset className="body-part-chips catalog-filters" aria-label="部位で絞り込み">
        {PART_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={part === filter.value}
            onClick={() => {
              setPart(filter.value);
              setDeleting(null);
            }}
          >
            {filter.label}
          </button>
        ))}
      </fieldset>
      {visible.length === 0 && (
        <p className="muted">
          {options.length ? "条件に合う種目がありません。" : "種目はありません。"}
        </p>
      )}
      <ul className="exercise-options">
        {visible.map((option) => (
          <li key={option.id}>
            <div className="exercise-option-name">
              <strong>{option.name}</strong>
              <BodyPartTags option={option} />
            </div>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              aria-label={`${option.name}の部位を編集`}
              onClick={() => edit(option)}
            >
              編集
            </button>
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
            {deleting?.id === option.id && (
              <fieldset className="notice" aria-label="種目リストからの削除確認">
                <p>「{deleting.name}」をリストから削除しますか？ 履歴は残ります。</p>
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
          </li>
        ))}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <output className="notice">{notice}</output>}
    </details>
  );
}
