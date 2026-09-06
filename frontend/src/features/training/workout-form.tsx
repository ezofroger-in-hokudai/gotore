"use client";

import { type Group, type Workout, api } from "@/lib/api";
import { type FormEvent, useEffect, useState } from "react";
import {
  type Draft,
  newDraft,
  newExercise,
  newSet,
  readDraft,
  today,
  workoutPayload,
} from "./draft";

export function WorkoutForm({
  groups,
  selectedGroup,
  userId,
  onSaved,
  onBack,
}: {
  groups: Group[];
  selectedGroup: string;
  userId: string;
  onSaved: (workout: Workout) => void;
  onBack: () => void;
}) {
  const storageKey = `gotore:draft:${userId}`;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);

  useEffect(() => {
    try {
      setDraft(readDraft(localStorage.getItem(storageKey)) ?? newDraft(selectedGroup));
    } catch {
      setDraft(newDraft(selectedGroup));
      setStorageWarning(true);
    }
  }, [storageKey, selectedGroup]);

  useEffect(() => {
    if (!draft) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      setStorageWarning(true);
    }
  }, [draft, storageKey]);

  function change(update: (draft: Draft) => Draft) {
    setError("");
    // 内容を変えた保存は別の送信として扱い、同じ内容の再試行だけIDを維持する。
    setDraft((current) => (current ? { ...update(current), id: crypto.randomUUID() } : current));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setError("");
    setBusy(true);
    try {
      const record = await api<Workout>("/workouts", {
        method: "POST",
        body: JSON.stringify(workoutPayload(draft)),
      });
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* 保存済み記録の表示は継続する。 */
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
        ← 戻る（下書きは残ります）
      </button>
      <p className="eyebrow">WORKOUT</p>
      <h1>今日のトレーニング</h1>
      <p className="muted">ひとつずつ、その頑張りを記録しよう。</p>
      <form onSubmit={submit}>
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
                  <input
                    required
                    maxLength={60}
                    list="exercises"
                    placeholder="例：ベンチプレス"
                    value={exercise.name}
                    onChange={(e) =>
                      change((d) => ({
                        ...d,
                        exercises: d.exercises.map((item) =>
                          item.key === exercise.key ? { ...item, name: e.target.value } : item,
                        ),
                      }))
                    }
                  />
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
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={1000}
                    step="0.1"
                    required
                    placeholder="0"
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
                            ? { ...item, sets: item.sets.filter((s) => s.key !== set.key) }
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
                onClick={() =>
                  change((d) => ({
                    ...d,
                    exercises: d.exercises.map((item) =>
                      item.key === exercise.key
                        ? { ...item, sets: [...item.sets, newSet()] }
                        : item,
                    ),
                  }))
                }
              >
                ＋ セットを追加
              </button>
            </div>
          ))}
          <datalist id="exercises">
            {[
              "ベンチプレス",
              "スクワット",
              "デッドリフト",
              "ペックフライ",
              "ラットプルダウン",
              "ショルダープレス",
              "懸垂",
              "腕立て伏せ",
            ].map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button
            type="button"
            className="secondary full"
            disabled={draft.exercises.length >= 20}
            onClick={() => change((d) => ({ ...d, exercises: [...d.exercises, newExercise()] }))}
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
            {busy ? "保存しています…" : target ? "記録を確定して共有 →" : "記録を保存 →"}
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
