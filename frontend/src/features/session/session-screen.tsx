"use client";
import { StampReceipt } from "../stamps/receipt";

import { LoadingState } from "../loading/loading-state";

import type { ExerciseOption, RecordBestSet, SessionBests, TrainingSession } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { BodyPartTags } from "../exercises/body-part-fields";
import { type BodyPartFilter, PART_FILTERS, filterExercises } from "../exercises/body-parts";
import { CatalogPanel } from "../exercises/catalog-panel";
import type { useExerciseCatalog } from "../exercises/use-exercise-catalog";
import { BestFlame } from "../training/best-flame";
import { memoDraftKey, readMemoDraft } from "../training/memo-draft";
import { useResource } from "../training/use-resource";
import { Sheet } from "../v2/sheet";
import { InlineMemo } from "./inline-memo";
import { NumberWheel } from "./number-wheel";
import {
  type SessionInput,
  emptyInput,
  estimatedRM,
  readSessionInput,
  setValue,
  updateSet,
} from "./session";
import { useExerciseContext } from "./use-exercise-context";
import type { SessionController } from "./use-session";

export function SessionScreen({
  catalog,
  active,
  controller,
  userId,
  onFinished,
  haptic,
}: {
  active: boolean;
  catalog: ReturnType<typeof useExerciseCatalog>;
  controller: SessionController;
  userId: string;
  onFinished: (record: TrainingSession) => void;
  haptic: boolean;
}) {
  const { session } = controller;
  const [draft, setDraft] = useState<SessionInput>({ ...emptyInput });
  if (!session && !controller.startingId)
    return (
      <section className="start-training">
        <h1>トレーニング</h1>
        <p>今日も、自分のペースで。</p>
        <button
          className="primary full"
          type="button"
          disabled={!controller.ready || controller.busy}
          onClick={() => {
            void controller.start().catch(() => {});
          }}
        >
          {controller.busy ? "開始中…" : "トレーニングを開始"}
        </button>
      </section>
    );
  return (
    <ActiveTraining
      active={active}
      key={session?.id ?? controller.startingId ?? "preparing"}
      session={session}
      controller={controller}
      userId={userId}
      onFinished={(record) => {
        setDraft({ ...emptyInput });
        onFinished(record);
      }}
      haptic={haptic}
      initialInput={draft}
      onPreparingInput={setDraft}
      catalog={catalog}
    />
  );
}

function ActiveTraining({
  active,
  session,
  controller,
  userId,
  onFinished,
  haptic,
  initialInput,
  onPreparingInput,
  catalog,
}: {
  active: boolean;
  session: TrainingSession | null;
  initialInput: SessionInput;
  onPreparingInput: (input: SessionInput) => void;
  catalog: ReturnType<typeof useExerciseCatalog>;
  controller: SessionController;
  userId: string;
  onFinished: (record: TrainingSession) => void;
  haptic: boolean;
}) {
  const sessionId = session?.id ?? null;
  const revision = session?.revision;
  const exercises = session?.exercises ?? [];
  // 開始確定直後も入力欄を無効化せず、入力中のフォーカスを保つ。
  const blocking = controller.busy && !controller.startingId;
  const storageKey = sessionId ? `gotore:session-input:v2:${userId}:${sessionId}` : null;
  const [input, setInput] = useState(() => {
    try {
      const saved = readSessionInput(storageKey ? localStorage.getItem(storageKey) : null);
      return saved.name ? saved : { ...initialInput, revision };
    } catch {
      return { ...initialInput, revision };
    }
  });
  useEffect(() => {
    if (!sessionId) onPreparingInput(input);
  }, [input, sessionId, onPreparingInput]);
  const [selecting, setSelecting] = useState(!input.name);
  const [catalogOpen, setCatalogOpen] = useState<false | "list" | "add">(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(true);
  const [workoutMemoOpen, setWorkoutMemoOpen] = useState(
    () => !!(sessionId && readMemoDraft(memoDraftKey(userId, `/workouts/${sessionId}/memo`))),
  );
  const repsField = useRef<HTMLInputElement>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const adding = useRef(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submission, setSubmission] = useState<{ revision: number; set: number } | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [undo, setUndo] = useState<{
    exercises: TrainingSession["exercises"];
    revision: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [part, setPart] = useState<BodyPartFilter>("all");
  const overviewBests = useResource<SessionBests>(
    sessionId ? `/sessions/${sessionId}/bests` : null,
    controller.confirmedRevision,
    false,
    true,
    { enabled: active && selecting && exercises.length > 0 },
  );
  const bestPositions = new Map(
    overviewBests.data && overviewBests.data.revision === revision && !controller.pending
      ? overviewBests.data.sets.map((set) => [`${set.exercise_index}:${set.set_index}`, set])
      : [],
  );
  const recordedNames = Array.from(new Set(exercises.map((exercise) => exercise.name)));
  const names = Array.from(
    new Set([
      ...(catalog.data ?? []).map((e) => e.name),
      ...exercises.map((e) => e.name),
      ...(input.name ? [input.name] : []),
    ]),
  );
  const optionsByName = new Map((catalog.data ?? []).map((option) => [option.name, option]));
  const visibleOptions = filterExercises(
    names.map((name) => optionsByName.get(name) ?? { name }),
    part,
    query,
  );
  const context = useExerciseContext(
    sessionId,
    input.name,
    (selecting ? visibleOptions.map((option) => option.name) : names).filter(
      (name) => name !== input.name,
    ),
    controller.confirmedRevision,
    active,
  );
  const sets = exercises.filter((e) => e.name === input.name).flatMap((e) => e.sets);
  const confirmedBests = new Map(
    context.data?.current_bests &&
      context.data.current_bests.revision === revision &&
      !controller.pending
      ? context.data.current_bests.sets.map((best) => [
          `${best.exercise_index}:${best.set_index}`,
          best,
        ])
      : [],
  );
  const selectedBests = exercises.flatMap((exercise, ei) =>
    exercise.name === input.name
      ? exercise.sets.map((_, si) => confirmedBests.get(`${ei}:${si}`))
      : [],
  );
  const previous = context.data?.previous?.sets ?? [];
  useEffect(() => {
    if (!input.awaitingPrevious) return;
    const untouched = !input.dirty && input.editing === null && sets.length === 0;
    if (untouched && !context.data) return;
    const first = untouched ? context.data?.previous?.sets[0] : undefined;
    // 遅い比較応答で手入力や今回の実績を戻さない。初期値の反映は選択ごとに一度だけ行う。
    setInput((current) =>
      current === input
        ? {
            ...current,
            ...(first ? { weight: String(first.weight), reps: String(first.reps) } : {}),
            awaitingPrevious: false,
          }
        : current,
    );
  }, [input, context.data, sets.length]);

  const latestInput = useRef(input);
  latestInput.current = input;
  const persistInput = useCallback(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(latestInput.current));
    } catch {
      setStorageWarning(true);
    }
  }, [storageKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 回転中の同期書き込みを避け、入力停止後に保存する。
  useEffect(() => {
    const timer = window.setTimeout(persistInput, 150);
    return () => window.clearTimeout(timer);
  }, [input, persistInput]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) persistInput();
    };
    window.addEventListener("pagehide", persistInput);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", persistInput);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [persistInput]);
  useEffect(() => {
    if (
      submission &&
      controller.saved?.id === sessionId &&
      controller.saved.revision >= submission.revision
    )
      setFeedback((current) => (current.startsWith("直前") ? current : "保存しました"));
  }, [controller.saved, sessionId, submission]);
  // 応答だけ失われた保存は、再起動時にサーバーと照合して二重追加を防ぐ。
  useEffect(() => {
    if (!storageKey) return;
    try {
      const pending = JSON.parse(localStorage.getItem(`${storageKey}:pending`) || "null");
      if (
        pending &&
        pending.revision + 1 === revision &&
        JSON.stringify(pending.exercises) === JSON.stringify(exercises)
      ) {
        localStorage.removeItem(`${storageKey}:pending`);
        setInput((value) => ({
          ...value,
          revision,
          editing: null,
          dirty: false,
        }));
        setFeedback("前回の保存を確認しました");
      }
    } catch {
      setStorageWarning(true);
    }
  }, [storageKey, revision, exercises]);
  const stale =
    input.revision !== undefined &&
    input.revision !== revision &&
    (input.dirty || input.editing !== null);

  async function save() {
    if (!session || !storageKey || controller.busy || stale || adding.current) return;
    adding.current = true;
    setError("");
    try {
      const value = setValue(input.weight, input.reps);
      const nextExercises = updateSet(exercises, input.name, value, input.editing);
      const result = await controller.save(nextExercises, revision);
      setSubmission({ revision: result.revision, set: (input.editing ?? sets.length) + 1 });
      setUndo({ exercises: exercises, revision: result.revision });
      // 端末保存の待機中に進んだ入力・種目選択は、保存開始時の値で戻さない。
      const currentInput = latestInput.current;
      const nextInput =
        currentInput === input
          ? { ...input, revision: result.revision, editing: null, dirty: false }
          : { ...currentInput, revision: result.revision };
      latestInput.current = nextInput;
      setInput(nextInput);
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextInput));
      } catch {
        setStorageWarning(true);
      }
      setFeedback(input.editing === null ? "追加しました" : "更新しました");
      if (haptic && typeof navigator.vibrate === "function") navigator.vibrate(15);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存できませんでした。");
    } finally {
      adding.current = false;
    }
  }
  async function copyAllPreviousSets() {
    if (
      !session ||
      !previous.length ||
      controller.busy ||
      stale ||
      sets.length + previous.length > 30
    )
      return;
    adding.current = true;
    setError(sets.length + previous.length > 30 ? "セットは30件までです。" : "");
    try {
      const nextExercises = previous.reduce(
        (current, value) => updateSet(current, input.name, value, null),
        exercises,
      );
      const result = await controller.save(nextExercises, revision);
      const last = previous.at(-1);
      setUndo({ exercises, revision: result.revision });
      setInput({
        ...input,
        revision: result.revision,
        weight: String(last?.weight ?? input.weight),
        reps: String(last?.reps ?? input.reps),
        editing: null,
        dirty: false,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存できませんでした。");
    } finally {
      adding.current = false;
    }
  }
  function selectExercise(name: string) {
    if (
      input.dirty &&
      input.name !== name &&
      !window.confirm("未保存の入力を破棄して種目を変更しますか？")
    )
      return;
    const recorded = exercises
      .filter((exercise) => exercise.name === name)
      .flatMap((exercise) => exercise.sets);
    if (input.name !== name) {
      const first = recorded.at(-1) ?? context.firstPreviousSet(name);
      setInput({
        name,
        revision,
        weight: String(first?.weight ?? 20),
        reps: String(first?.reps ?? 10),
        awaitingPrevious: !first,
        editing: null,
        dirty: false,
      });
      setFeedback("");
      setSubmission(null);
      setUndo(null);
    }
    setSelecting(false);
  }

  return (
    <section className={`session-screen${selecting ? "" : " entering-sets"}`}>
      <div className={selecting ? "section-heading" : "section-heading recording-header"}>
        {selecting ? (
          <span className="eyebrow">
            {session?.performed_on.replaceAll("-", "/")} · トレーニング中
          </span>
        ) : (
          <div className="recording-exercise-heading">
            <h1 aria-label={input.name}>
              <button
                type="button"
                className="exercise-information"
                aria-label={`${input.name}の種目情報`}
                onClick={() => setInfoOpen(true)}
              >
                {input.name}
              </button>
            </h1>
            {context.data?.memo.content.trim() && (
              <button
                type="button"
                className="exercise-memo-preview"
                aria-label={`${input.name}のメモを編集`}
                onClick={() => setInfoOpen(true)}
              >
                <span>✎ メモ</span>
                <span>{context.data.memo.content}</span>
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className="secondary finish-training"
          aria-label="トレーニング終了"
          disabled={!session || controller.busy}
          onClick={() => setFinishOpen(true)}
        >
          終了
        </button>
      </div>
      {selecting && session && (
        <StampReceipt key={session.id} workoutId={session.id} active={active} />
      )}
      {storageWarning && (
        <p className="error" role="alert">
          この端末に入力を保存できません。閉じる前にセットを保存してください。
        </p>
      )}
      {selecting ? (
        <>
          <div className="section-heading">
            <h1>種目を選択</h1>
            <button className="text-button" type="button" onClick={() => setCatalogOpen("list")}>
              種目一覧
            </button>
          </div>
          <section className="session-overview" aria-label="記録一覧">
            <div className="session-overview-heading">
              <h2>記録</h2>
              <span className="muted">
                {exercises.reduce((count, exercise) => count + exercise.sets.length, 0)}セット
              </span>
            </div>
            {exercises.length > 0 && (
              <div className="session-exercise-shortcuts">
                {recordedNames.map((name) => (
                  <button
                    type="button"
                    className="text-button"
                    key={name}
                    aria-label={`記録に戻る：${name}`}
                    aria-current={input.name === name ? "true" : undefined}
                    onClick={() => selectExercise(name)}
                  >
                    <span>
                      {name}
                      {input.name === name && <small> · 入力中</small>}
                    </span>
                    <span className="muted">
                      {exercises
                        .filter((exercise) => exercise.name === name)
                        .reduce((count, exercise) => count + exercise.sets.length, 0)}
                      セット ›
                    </span>
                  </button>
                ))}
              </div>
            )}
            <details className="session-overview-details">
              <summary>セットの詳細</summary>
              {exercises.length ? (
                exercises.map((exercise, index) => (
                  <div key={`${exercise.name}-${index}`}>
                    <h3>
                      {exercise.name} · {exercise.sets.length}セット
                    </h3>
                    <ol>
                      {exercise.sets.map((value, i) => (
                        <li
                          key={`set-${i + 1}`}
                          className={
                            bestPositions.has(`${index}:${i}`) ? "record-celebration" : undefined
                          }
                        >
                          {bestPositions.has(`${index}:${i}`) && (
                            <BestFlame best={bestPositions.get(`${index}:${i}`)} />
                          )}
                          {i + 1}: {value.weight}kg × {value.reps}回
                        </li>
                      ))}
                    </ol>
                  </div>
                ))
              ) : (
                <p className="muted">まだセットがありません</p>
              )}
            </details>
          </section>
          {overviewBests.error && (
            <p className="error" role="alert">
              {overviewBests.error}
              <button className="text-button" type="button" onClick={overviewBests.retry}>
                再試行
              </button>
            </p>
          )}
          <label className="search-label">
            種目を検索
            <input
              placeholder="種目名で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <fieldset className="body-part-chips" aria-label="部位で絞り込み">
            {PART_FILTERS.map((filter) => (
              <button
                type="button"
                key={filter.value}
                aria-pressed={part === filter.value}
                onClick={() => setPart(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </fieldset>
          <div className="exercise-filter-heading">
            <span className="muted">{visibleOptions.length}種目</span>
          </div>
          {catalog.error && (
            <p role="alert" className="error">
              {catalog.error}
              <button type="button" className="text-button" onClick={catalog.retry}>
                再試行
              </button>
            </p>
          )}
          <div className="v2-rows exercise-picker-list">
            {visibleOptions.map((option) => (
              <button
                type="button"
                className="v2-row"
                key={option.name}
                onClick={() => selectExercise(option.name)}
              >
                <span className="exercise-option-name">
                  <strong>{option.name}</strong>
                  <BodyPartTags option={option} />
                </span>
                <span className="muted" aria-hidden="true">
                  ›
                </span>
              </button>
            ))}
          </div>
          {names.length > 0 && visibleOptions.length === 0 && (
            <p className="muted">条件に合う種目がありません。</p>
          )}
          {!names.length && !catalog.loading && (
            <p className="muted">種目一覧から種目を追加してください。</p>
          )}
          <button
            className="secondary full exercise-add-button"
            type="button"
            onClick={() => setCatalogOpen("add")}
          >
            新しい種目を追加
          </button>
        </>
      ) : (
        <>
          {infoOpen && (
            <Sheet
              title={catalogOpen ? "種目一覧" : "種目情報"}
              onClose={() => {
                setInfoOpen(false);
                setCatalogOpen(false);
              }}
            >
              {catalogOpen ? (
                <CatalogPanel catalog={catalog} disabled={controller.busy} />
              ) : (
                <>
                  <h2>{input.name}</h2>
                  <div className="personal-bests">
                    <div>
                      <span>最高重量</span>
                      <strong>
                        {context.data?.best_weight ?? "—"}
                        <small> kg</small>
                      </strong>
                    </div>
                    <div>
                      <span>1RM</span>
                      <strong>
                        {context.data?.best_rm ?? "—"}
                        <small> kg</small>
                      </strong>
                    </div>
                  </div>
                  <BodyPartTags option={optionsByName.get(input.name)} />
                  <button
                    type="button"
                    className="secondary full"
                    disabled={blocking}
                    onClick={() => {
                      setInfoOpen(false);
                      setSelecting(true);
                    }}
                  >
                    種目を変更
                  </button>
                  <button
                    type="button"
                    className="secondary full"
                    onClick={() => {
                      setCatalogOpen("list");
                    }}
                  >
                    種目一覧
                  </button>
                </>
              )}
            </Sheet>
          )}
          {context.error && (
            <p className="error" role="alert">
              {context.error}
              <button type="button" onClick={context.retry}>
                再試行
              </button>
            </p>
          )}
          <div className="set-comparison">
            <div className="comparison-heading">
              {previous.length > 0 && (
                <button
                  type="button"
                  className="previous-copy all-copy"
                  aria-label="前回の全セットをコピー"
                  onClick={() => void copyAllPreviousSets()}
                >
                  ⧉
                </button>
              )}
              {session && (
                <StampReceipt workoutId={session.id} active={active} presentation="toast" />
              )}
            </div>
            <section className="comparison-table" aria-label="全セットの比較">
              {Array.from({ length: Math.max(previous.length, sets.length, 1) }, (_, i) => (
                <div className="comparison-row" key={`set-${i + 1}`}>
                  <span>{i + 1}</span>
                  <button
                    type="button"
                    className={`${input.editing === i ? "editing-set" : ""}${selectedBests[i] ? " best-set" : ""}`}
                    disabled={!sets[i] || controller.busy}
                    aria-label={`セット${i + 1}を編集`}
                    onClick={() => {
                      setInputOpen(true);
                      setInput({
                        ...input,
                        revision,
                        weight: String(sets[i].weight),
                        reps: String(sets[i].reps),
                        editing: i,
                        dirty: false,
                      });
                      setFeedback("");
                    }}
                  >
                    {sets[i] ? (
                      <SetMeasurement
                        weight={sets[i].weight}
                        reps={sets[i].reps}
                        best={selectedBests[i]}
                      />
                    ) : (
                      <span className="muted">未記録</span>
                    )}
                  </button>
                  <span className="previous-set">
                    <span>
                      前回 {previous[i] ? `${previous[i].weight}kg × ${previous[i].reps}回` : "—"}
                    </span>
                    {previous[i] && (
                      <button
                        type="button"
                        className="previous-copy"
                        aria-label={`前回のセット${i + 1}をコピー`}
                        onClick={() => {
                          setInputOpen(true);
                          setInput({
                            ...input,
                            revision,
                            weight: String(previous[i].weight),
                            reps: String(previous[i].reps),
                            editing: null,
                            dirty: true,
                          });
                        }}
                      >
                        ⧉
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </section>
          </div>
          <form
            className="set-entry"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {stale && (
              <p className="error" role="alert">
                別の保存があります。入力値は保持しています。保存済み行を選び直すか、新しいセットとして入力してください。
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setInput({ ...input, editing: null, revision })}
                >
                  新しいセットとして入力
                </button>
              </p>
            )}
            <fieldset
              className={inputOpen ? undefined : "input-collapsed"}
              disabled={blocking || stale || controller.status === "conflict"}
            >
              <div className="section-heading">
                <h2>
                  {input.editing === null
                    ? `SET ${sets.length + 1}`
                    : `SET ${input.editing + 1} を編集`}
                </h2>
                <button
                  type="button"
                  className="memo-toggle entry-memo-toggle"
                  aria-label="メモを開く"
                  onClick={() => setWorkoutMemoOpen(true)}
                >
                  <MemoIcon /> <span>メモ</span>
                </button>
                <button
                  type="button"
                  className="input-toggle"
                  aria-label={inputOpen ? "入力欄をしまう" : "入力欄を開く"}
                  aria-expanded={inputOpen}
                  onClick={() => setInputOpen(!inputOpen)}
                >
                  <span aria-hidden="true">{inputOpen ? "⌃" : "⌄"}</span>
                </button>
                {input.editing === null && undo && undo.revision === revision && (
                  <button
                    className="text-button undo-button"
                    aria-label="直前の保存を取り消す"
                    type="button"
                    disabled={controller.busy}
                    onClick={async () => {
                      try {
                        const result = await controller.save(undo.exercises);
                        setInput((value) => ({ ...value, revision: result.revision }));
                        setUndo(null);
                        setFeedback("直前の保存を取り消しました");
                      } catch (reason) {
                        setError(
                          reason instanceof Error ? reason.message : "取消できませんでした。",
                        );
                      }
                    }}
                  >
                    取消
                  </button>
                )}
                {input.editing !== null && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      setInput({
                        ...input,
                        weight: String(sets.at(-1)?.weight ?? 20),
                        reps: String(sets.at(-1)?.reps ?? 10),
                        revision,
                        editing: null,
                        dirty: false,
                      })
                    }
                  >
                    キャンセル
                  </button>
                )}
              </div>
              <div className="wheels">
                <NumberWheel
                  label="重量"
                  onEnter={() => {
                    repsField.current?.focus();
                    repsField.current?.select();
                  }}
                  unit="kg"
                  value={input.weight}
                  step={0.5}
                  min={0}
                  onChange={(weight) => {
                    setInput({
                      ...input,
                      revision:
                        input.dirty || input.editing !== null
                          ? (input.revision ?? revision)
                          : revision,
                      weight,
                      dirty: true,
                    });
                    setFeedback("");
                  }}
                />
                <NumberWheel
                  label="回数"
                  inputRef={repsField}
                  onEnter={() => repsField.current?.form?.requestSubmit()}
                  unit="回"
                  value={input.reps}
                  step={1}
                  min={1}
                  onChange={(reps) => {
                    setInput({
                      ...input,
                      revision:
                        input.dirty || input.editing !== null
                          ? (input.revision ?? revision)
                          : revision,
                      reps,
                      dirty: true,
                    });
                    setFeedback("");
                  }}
                />
              </div>
              <div className="set-actions">
                <button
                  className="secondary next-exercise"
                  type="button"
                  onClick={() => setSelecting(true)}
                >
                  次の種目へ
                </button>
                <button
                  className="primary"
                  type="submit"
                  disabled={!session || controller.busy}
                  aria-label={input.editing === null ? "次のセットへ" : "更新する"}
                >
                  <span>{input.editing === null ? "次のセットへ" : "更新する"}</span>
                </button>
              </div>
            </fieldset>
          </form>
          {workoutMemoOpen && sessionId && (
            <Sheet title="メモ" onClose={() => setWorkoutMemoOpen(false)}>
              <InlineMemo title="メモ" path={`/workouts/${sessionId}/memo`} userId={userId} />
            </Sheet>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </>
      )}
      {catalogOpen && !infoOpen && (
        <Sheet title="種目一覧" onClose={() => setCatalogOpen(false)}>
          <CatalogPanel
            catalog={catalog}
            disabled={controller.busy}
            startAdding={catalogOpen === "add"}
          />
        </Sheet>
      )}
      {(controller.status === "offline" || controller.status === "conflict") && (
        <div className="sync-status" aria-live="polite">
          <button
            type="button"
            className="text-button"
            onClick={() =>
              controller.status === "offline" ? void controller.sync() : setConflictOpen(true)
            }
          >
            {controller.status === "offline" ? "送信を再試行" : "未送信の記録を確認"}
          </button>
        </div>
      )}
      {conflictOpen && (
        <Sheet title="未送信の記録" onClose={() => setConflictOpen(false)}>
          <p>別の更新があるため送信を止めています。以下は端末に残っている内容です。</p>
          <textarea
            aria-label="端末に残っている記録"
            readOnly
            rows={8}
            value={exercises
              .map(
                (exercise) =>
                  `${exercise.name}\n${exercise.sets.map((value, index) => `${index + 1}: ${value.weight}kg × ${value.reps}`).join("\n")}`,
              )
              .join("\n\n")}
          />
          <button
            type="button"
            className="secondary full"
            onClick={async () => {
              if (
                !window.confirm(
                  "端末の未送信分を破棄して、サーバーの記録を採用しますか？必要な内容を控えてから進めてください。",
                )
              )
                return;
              try {
                await controller.discardPending();
                setConflictOpen(false);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "読み直せませんでした。");
              }
            }}
          >
            未送信分を破棄して読み直す
          </button>
        </Sheet>
      )}
      {finishOpen && session && (
        <Sheet
          title="トレーニング終了"
          showCloseButton={false}
          onClose={() => {
            if (!controller.busy) setFinishOpen(false);
          }}
        >
          <div className="recording-finish-actions">
            <button
              className="secondary"
              type="button"
              disabled={controller.busy}
              onClick={() => setFinishOpen(false)}
            >
              記録に戻る
            </button>
            <button
              className="primary"
              type="button"
              disabled={controller.busy}
              onClick={async () => {
                try {
                  const finished = await controller.finish(() => {
                    // 終了で入力画面が消える前に、確認シートの自動「戻る」を解除する。
                    const state = { ...window.history.state };
                    state.gotoreSheet = undefined;
                    window.history.replaceState(state, "");
                  });
                  try {
                    if (storageKey) localStorage.removeItem(storageKey);
                  } catch {}
                  onFinished(finished);
                } catch {
                  setFinishOpen(false);
                }
              }}
            >
              {controller.busy ? "終了中…" : "終了する"}
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function SetMeasurement({
  weight,
  reps,
  best,
}: { weight: number; reps: number; best?: RecordBestSet }) {
  return (
    <span className="set-measurement">
      <span>
        {best && <BestFlame best={best} />}
        <b className={best?.weight ? "personal-best-value" : undefined}>{weight}</b>kg × {reps}
      </span>
      <small>
        RM{" "}
        <b className={best?.rm ? "personal-best-value" : undefined}>
          {estimatedRM(weight, reps) ?? "—"}
        </b>
      </small>
    </span>
  );
}

function MemoIcon() {
  return (
    <svg
      className="recording-memo-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5" />
    </svg>
  );
}
