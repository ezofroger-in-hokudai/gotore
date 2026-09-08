"use client";

import { type ExerciseOption, type Group, type Workout, api } from "@/lib/api";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ExerciseCatalog } from "../exercises/exercise-catalog";
import {
  type Draft,
  editDraft,
  newDraft,
  newExercise,
  newSet,
  readDraft,
  today,
  workoutPayload,
} from "./draft";
import { useResource } from "./use-resource";

export function WorkoutForm({
  groups,
  selectedGroup,
  userId,
  onSaved,
  onBack,
  editing,
}: {
  editing?: Workout | null;
  groups: Group[];
  selectedGroup: string;
  userId: string;
  onSaved: (workout: Workout) => void;
  onBack: () => void;
}) {
  const catalog = useResource<ExerciseOption[]>("/exercise-options");
  const options = catalog.data ?? [];
  const storageKey = `gotore:draft:${userId}`;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [focusKey, setFocusKey] = useState<string | null>(null);

  useEffect(() => {
    if (!focusKey) return;
    inputs.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey]);

  useEffect(() => {
    if (editing) {
      setDraft(editDraft(editing));
      return;
    }
    try {
      setDraft(readDraft(localStorage.getItem(storageKey)) ?? newDraft(selectedGroup));
    } catch {
      setDraft(newDraft(selectedGroup));
      setStorageWarning(true);
    }
  }, [storageKey, selectedGroup, editing]);

  useEffect(() => {
    if (!draft || editing) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      setStorageWarning(true);
    }
  }, [draft, storageKey, editing]);

  function change(update: (draft: Draft) => Draft) {
    setError("");
    // 新規記録は内容変更で送信IDを更新し、既存記録の編集は元IDを維持する。
    setDraft((current) =>
      current ? { ...update(current), id: editing ? current.id : crypto.randomUUID() } : current,
    );
  }

  function addSet(exerciseKey: string) {
    const next = newSet();
    change((d) => ({
      ...d,
      exercises: d.exercises.map((item) =>
        item.key === exerciseKey && item.sets.length < 30
          ? { ...item, sets: [...item.sets, next] }
          : item,
      ),
    }));
    setFocusKey(`${next.key}:weight`);
  }

  function advance(
    event: KeyboardEvent<HTMLInputElement>,
    exerciseIndex: number,
    setIndex: number,
    field: "weight" | "reps",
  ) {
    if (event.key !== "Enter") return;
    // IME確定・長押しもフォームの暗黙送信には使わない。
    event.preventDefault();
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat || busy || !draft)
      return;
    const exercise = draft.exercises[exerciseIndex];
    const set = exercise.sets[setIndex];
    if (
      field === "weight" &&
      event.currentTarget.value === "" &&
      !event.currentTarget.validity.badInput
    ) {
      const previous = exercise.sets[setIndex - 1];
      const previousInput = previous && inputs.current.get(`${previous.key}:weight`);
      if (previousInput?.checkValidity()) {
        change((d) => ({
          ...d,
          exercises: d.exercises.map((item) =>
            item.key === exercise.key
              ? {
                  ...item,
                  sets: item.sets.map((s) =>
                    s.key === set.key ? { ...s, weight: previous.weight } : s,
                  ),
                }
              : item,
          ),
        }));
        setFocusKey(`${set.key}:reps`);
        return;
      }
    }
    if (!event.currentTarget.reportValidity()) return;
    if (field === "weight") {
      inputs.current.get(`${set.key}:reps`)?.focus();
      return;
    }
    const weight = inputs.current.get(`${set.key}:weight`);
    if (weight && !weight.reportValidity()) {
      weight.focus();
      return;
    }
    const next = exercise.sets[setIndex + 1];
    if (next) inputs.current.get(`${next.key}:weight`)?.focus();
    else if (exercise.sets.length < 30) addSet(exercise.key);
    else setError("1種目は30セットまでです。保存は下の確定ボタンから行ってください。");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setError("");
    setBusy(true);
    try {
      const payload = workoutPayload(draft);
      const record = await api<Workout>(editing ? `/workouts/${editing.id}` : "/workouts", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(
          editing
            ? {
                performed_on: payload.performed_on,
                exercises: payload.exercises,
                expected_revision: editing.revision,
              }
            : payload,
        ),
      });
      if (!editing) {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* 保存済み記録の表示は継続する。 */
        }
      }
      onSaved(record);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  if (!draft) return <output>入力画面を準備しています…</output>;
  const target = groups.find((group) => group.id === draft.group_id);
  const missingGroup = !!draft.group_id && !target;

  return (
    <section>
      <button type="button" className="back" disabled={busy} onClick={onBack}>
        {editing ? "← 編集をやめて記録に戻る" : "← 戻る（下書きは残ります）"}
      </button>
      <p className="eyebrow">WORKOUT</p>
      <h1>{editing ? "トレーニングを編集" : "今日のトレーニング"}</h1>
      {editing && (
        <p className="notice">
          共有先は変更できません。編集内容は自動保存されず、戻ると破棄されます。新規記録の下書きは残ります。
        </p>
      )}
      <p className="muted">ひとつずつ、その頑張りを記録しよう。</p>
      <p className="muted">Enterで次の入力へ。最後の回数欄ではセットを追加します。</p>
      <p className="muted">重量の薄い数字は前セットの値です。空欄でEnterを押すと採用します。</p>
      <p className="muted">
        種目は自分のリストから選びます。新しい種目は下の管理欄で追加できます。
      </p>
      {catalog.loading && <output className="loading">種目リストを読み込んでいます…</output>}
      {catalog.error && (
        <div className="error" role="alert">
          {catalog.error}
          <button type="button" className="text-button" onClick={catalog.retry}>
            種目リストを再取得
          </button>
        </div>
      )}
      {catalog.data?.length === 0 && !catalog.error && (
        <p className="notice">
          種目リストは空です。「自分の種目リストを管理」から追加してください。
        </p>
      )}
      <ExerciseCatalog
        options={options}
        disabled={busy || catalog.loading || catalog.data === null || !!catalog.error}
        onChanged={catalog.retry}
      />
      <form
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target instanceof HTMLInputElement)
            event.preventDefault();
        }}
      >
        <fieldset disabled={busy}>
          <div className="panel form-grid">
            <label>
              トレーニング日
              <input
                type="date"
                min="2000-01-01"
                max={today()}
                required
                value={draft.performed_on}
                onChange={(e) => change((d) => ({ ...d, performed_on: e.target.value }))}
              />
            </label>
            <label>
              共有先
              <select
                disabled={!!editing}
                value={draft.group_id}
                onChange={(e) => change((d) => ({ ...d, group_id: e.target.value }))}
              >
                <option value="">自分だけの記録</option>
                {missingGroup && <option value={draft.group_id}>共有先を選び直してください</option>}
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {draft.exercises.map((exercise, index) => (
            <div className="panel exercise" key={exercise.key}>
              <div className="exercise-title">
                <span className="number">{String(index + 1).padStart(2, "0")}</span>
                <label className="grow">
                  種目名
                  <select
                    aria-label="種目名"
                    required
                    disabled={catalog.loading || catalog.data === null}
                    value={exercise.name}
                    onChange={(e) =>
                      change((d) => ({
                        ...d,
                        exercises: d.exercises.map((item) =>
                          item.key === exercise.key ? { ...item, name: e.target.value } : item,
                        ),
                      }))
                    }
                  >
                    <option value="">種目を選んでください</option>
                    {exercise.name && !options.some((option) => option.name === exercise.name) && (
                      <option value={exercise.name}>{exercise.name}（下書きの種目）</option>
                    )}
                    {options.map((option) => (
                      <option key={option.id} value={option.name}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
                {draft.exercises.length > 1 && (
                  <button
                    className="text-button"
                    type="button"
                    aria-label={`種目${index + 1}を削除`}
                    onClick={() =>
                      change((d) => ({
                        ...d,
                        exercises: d.exercises.filter((item) => item.key !== exercise.key),
                      }))
                    }
                  >
                    削除
                  </button>
                )}
              </div>
              <div className="set-head">
                <span>SET</span>
                <span>重量 kg</span>
                <span>回数 reps</span>
                <span />
              </div>
              {exercise.sets.map((set, setIndex) => (
                <div className="set-row" key={set.key}>
                  <span className="set-index">{setIndex + 1}</span>
                  <input
                    aria-label={`種目${index + 1} セット${setIndex + 1} 重量`}
                    ref={(element) => {
                      if (element) inputs.current.set(`${set.key}:weight`, element);
                      else inputs.current.delete(`${set.key}:weight`);
                    }}
                    enterKeyHint="next"
                    onKeyDown={(event) => advance(event, index, setIndex, "weight")}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={1000}
                    step="0.1"
                    required
                    placeholder={exercise.sets[setIndex - 1]?.weight || "0"}
                    value={set.weight}
                    onChange={(e) =>
                      change((d) => ({
                        ...d,
                        exercises: d.exercises.map((item) =>
                          item.key === exercise.key
                            ? {
                                ...item,
                                sets: item.sets.map((s) =>
                                  s.key === set.key ? { ...s, weight: e.target.value } : s,
                                ),
                              }
                            : item,
                        ),
                      }))
                    }
                  />
                  <input
                    aria-label={`種目${index + 1} セット${setIndex + 1} 回数`}
                    ref={(element) => {
                      if (element) inputs.current.set(`${set.key}:reps`, element);
                      else inputs.current.delete(`${set.key}:reps`);
                    }}
                    enterKeyHint="next"
                    onKeyDown={(event) => advance(event, index, setIndex, "reps")}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1000}
                    step={1}
                    required
                    placeholder="10"
                    value={set.reps}
                    onChange={(e) =>
                      change((d) => ({
                        ...d,
                        exercises: d.exercises.map((item) =>
                          item.key === exercise.key
                            ? {
                                ...item,
                                sets: item.sets.map((s) =>
                                  s.key === set.key ? { ...s, reps: e.target.value } : s,
                                ),
                              }
                            : item,
                        ),
                      }))
                    }
                  />
                  <button
                    className="remove"
                    type="button"
                    disabled={exercise.sets.length === 1}
                    aria-label={`種目${index + 1} セット${setIndex + 1}を削除`}
                    onClick={() =>
                      change((d) => ({
                        ...d,
                        exercises: d.exercises.map((item) =>
                          item.key === exercise.key
                            ? {
                                ...item,
                                sets: item.sets.filter((s) => s.key !== set.key),
                              }
                            : item,
                        ),
                      }))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondary full"
                disabled={exercise.sets.length >= 30}
                onClick={() => addSet(exercise.key)}
              >
                ＋ セットを追加
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary full"
            disabled={draft.exercises.length >= 20}
            onClick={() =>
              change((d) => ({
                ...d,
                exercises: [...d.exercises, newExercise()],
              }))
            }
          >
            ＋ 種目を追加
          </button>
          <p className="notice">
            {target
              ? `確定すると「${target.name}」のメンバーに、表示名・日付・種目・重量・回数が共有されます。`
              : missingGroup
                ? "共有先を選び直してください。"
                : "この記録は自分だけに表示されます。"}
          </p>
          <button className="primary" type="submit" disabled={missingGroup}>
            {busy
              ? "保存しています…"
              : editing
                ? "変更を保存 →"
                : target
                  ? "記録を確定して共有 →"
                  : "記録を保存 →"}
          </button>
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error} 入力内容は残っています。
          </p>
        )}
        {storageWarning && (
          <output className="notice">
            このブラウザでは下書きを保持できません。画面を閉じる前に保存してください。
          </output>
        )}
      </form>
    </section>
  );
}
