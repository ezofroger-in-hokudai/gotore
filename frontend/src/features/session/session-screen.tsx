"use client";

import type { BodyPart, RecordBestSet, SessionBests, TrainingSession } from "@/lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BODY_PARTS, BODY_PART_LABELS, normalizeBodyPart } from "../exercises/body-parts";
import { ExerciseCatalog } from "../exercises/exercise-catalog";
import type { useExerciseCatalog } from "../exercises/use-exercise-catalog";
import { BestFlame } from "../training/best-flame";
import { memoDraftKey, readMemoDraft } from "../training/memo-draft";
import { useResource } from "../training/use-resource";
import { Sheet } from "../v2/sheet";
import { describeElapsedTime } from "./elapsed-time";
import { FinishConfirmDialog } from "./finish-confirm-dialog";
import { InlineMemo } from "./inline-memo";
import { NumberWheel } from "./number-wheel";
import {
  type SessionInput,
  appendSets,
  bestUpdate,
  displayEstimatedRM,
  emptyInput,
  readSessionInput,
  removeSet,
  setValue,
  updateSet,
} from "./session";
import { sessionExerciseOptions } from "./session-exercise-options";
import { TrainingOverview } from "./training-overview";
import { useExerciseContext } from "./use-exercise-context";
import { useFinishWeekRecords } from "./use-finish-week-records";
import type { SessionController } from "./use-session";

function ElapsedClock({ elapsed }: { elapsed: string | null }) {
  if (!elapsed) return null;
  return (
    <span
      className="session-elapsed"
      role="timer"
      aria-label={`経過時間 ${describeElapsedTime(elapsed)}`}
    >
      <svg viewBox="0 0 20 22" fill="none" aria-hidden="true">
        <path d="M8 2h4M10 5v2M16 6l1-1" />
        <circle cx="10" cy="14" r="6.5" />
        <path d="M10 10v4l2.5 1.5" />
      </svg>
      {elapsed}
    </span>
  );
}

export function SessionScreen({
  active,
  controller,
  userId,
  recent,
  onHistory,
  onFinished,
  haptic,
  catalog,
  elapsed,
}: {
  active: boolean;
  controller: SessionController;
  userId: string;
  recent: Parameters<typeof TrainingOverview>[0]["resource"];
  onHistory: () => void;
  onFinished: (record: TrainingSession) => void;
  haptic: boolean;
  catalog: ReturnType<typeof useExerciseCatalog>;
  elapsed: string | null;
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
          disabled={!controller.ready || controller.busy || controller.finishPending}
          onClick={() => {
            void controller.start().catch(() => {});
          }}
        >
          {controller.busy ? "開始中…" : "トレーニングを開始"}
        </button>
        <TrainingOverview resource={recent} onHistory={onHistory} />
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
      elapsed={elapsed}
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
  elapsed,
}: {
  active: boolean;
  session: TrainingSession | null;
  initialInput: SessionInput;
  onPreparingInput: (input: SessionInput) => void;
  catalog: ReturnType<typeof useExerciseCatalog>;
  elapsed: string | null;
  controller: SessionController;
  userId: string;
  onFinished: (record: TrainingSession) => void;
  haptic: boolean;
}) {
  const sessionId = session?.id ?? null;
  const revision = session?.revision;
  const exercises = session?.exercises ?? [];
  const hasRecordedSets = exercises.some((exercise) => exercise.sets.length > 0);
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
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(true);
  const repsField = useRef<HTMLInputElement>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const adding = useRef(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const finishRecords = useFinishWeekRecords(
    active,
    sessionId,
    session?.performed_on ?? null,
    finishOpen,
  );
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [selectedParts, setSelectedParts] = useState<BodyPart[]>([]);
  const overviewBests = useResource<SessionBests>(
    sessionId ? `/sessions/${sessionId}/bests` : null,
    controller.confirmedRevision,
    false,
    true,
    { enabled: active && selecting && exercises.length > 0 },
  );
  const bestPositions = new Map(
    overviewBests.data && overviewBests.data.revision === revision && !controller.pending
      ? overviewBests.data.sets.map(
          (set) => [`${set.exercise_index}:${set.set_index}`, set] as const,
        )
      : [],
  );
  const candidates = sessionExerciseOptions(catalog.data ?? [], exercises)
    .filter(
      (option) =>
        selectedParts.length === 0 ||
        selectedParts.includes(normalizeBodyPart(option.primary_body_part)),
    )
    .toSorted((left, right) => {
      const leftUsed = exercises.some((exercise) => exercise.name === left.name);
      const rightUsed = exercises.some((exercise) => exercise.name === right.name);
      return (
        Number(rightUsed) - Number(leftUsed) ||
        (right.last_performed_on ?? "").localeCompare(left.last_performed_on ?? "")
      );
    });
  const context = useExerciseContext(
    sessionId,
    input.name,
    candidates.map((candidate) => candidate.name).filter((name) => name !== input.name),
    controller.confirmedRevision,
    active,
  );
  const sets = exercises.filter((e) => e.name === input.name).flatMap((e) => e.sets);
  const confirmedBests = new Map(
    context.data?.current_bests &&
      context.data.current_bests.revision === revision &&
      !controller.pending
      ? context.data.current_bests.sets.map(
          (set) => [`${set.exercise_index}:${set.set_index}`, set] as const,
        )
      : [],
  );
  const selectedBests = exercises.flatMap((exercise, exerciseIndex) =>
    exercise.name === input.name
      ? exercise.sets.map((_, setIndex) => confirmedBests.get(`${exerciseIndex}:${setIndex}`))
      : [],
  );
  const previous = context.data?.previous?.sets ?? [];
  const pendingExerciseMemo = useMemo(
    () =>
      input.name ? readMemoDraft(memoDraftKey(userId, input.name))?.content.trim() : undefined,
    [userId, input.name],
  );
  const pendingTodayMemo = useMemo(() => {
    const id = sessionId ?? controller.startingId;
    if (!id || !input.name) return undefined;
    const path = `/sessions/${id}/exercise-memo?name=${encodeURIComponent(input.name)}`;
    return readMemoDraft(memoDraftKey(userId, path))?.content.trim();
  }, [userId, input.name, sessionId, controller.startingId]);
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
    if (!active) persistInput();
  }, [active, persistInput]);
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
    if (
      !session ||
      !storageKey ||
      controller.busy ||
      stale ||
      adding.current ||
      input.awaitingPrevious
    )
      return;
    adding.current = true;
    setError("");
    try {
      const value = setValue(input.weight, input.reps);
      const nextExercises = updateSet(exercises, input.name, value, input.editing);
      const result = await controller.save(nextExercises, revision);
      // 保存待ち中に変更した次の入力・選択種目は、完了した保存で上書きしない。
      const current = latestInput.current;
      const nextInput =
        current === input
          ? { ...input, revision: result.revision, editing: null, dirty: false }
          : { ...current, revision: result.revision };
      setInput(nextInput);
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextInput));
      } catch {
        setStorageWarning(true);
      }
      if (haptic && typeof navigator.vibrate === "function") navigator.vibrate(15);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存できませんでした。");
    } finally {
      adding.current = false;
    }
  }
  async function copyPreviousSets() {
    if (!session || !previous.length || controller.busy) return;
    setError("");
    try {
      const result = await controller.save(appendSets(exercises, input.name, previous), revision);
      setInput((value) => ({ ...value, revision: result.revision, editing: null, dirty: false }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "前回のセットをコピーできませんでした。");
    }
  }
  async function deleteSet(index: number) {
    if (!session || controller.busy) return;
    setError("");
    try {
      const result = await controller.save(removeSet(exercises, input.name, index), revision);
      setInput((value) => ({ ...value, revision: result.revision, editing: null, dirty: false }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "セットを削除できませんでした。");
    }
  }
  const candidate =
    input.editing === null && bestUpdate(Number(input.weight), Number(input.reps), context.data);
  const rm = displayEstimatedRM(Number(input.weight), Number(input.reps));
  async function copyPreviousIntoNextSet(value: { weight: number; reps: number }) {
    if (!session || controller.busy || adding.current) return;
    adding.current = true;
    setError("");
    try {
      const result = await controller.save(updateSet(exercises, input.name, value, null), revision);
      setInput({
        ...input,
        revision: result.revision,
        weight: String(value.weight),
        reps: String(value.reps),
        editing: null,
        dirty: false,
      });
      setInputOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "前回のセットをコピーできませんでした。");
    } finally {
      adding.current = false;
    }
  }

  function openExerciseSelection() {
    // 次の種目・画面遷移でも、未確定の数値入力は先に端末へ残す。
    persistInput();
    setSelecting(true);
  }

  function chooseExercise(name: string) {
    if (
      input.dirty &&
      input.name !== name &&
      !window.confirm("入力中の数値を破棄して種目を変更しますか？")
    )
      return;
    if (input.name === name) {
      setSelecting(false);
      return;
    }
    const latest = exercises
      .filter((exercise) => exercise.name === name)
      .flatMap((exercise) => exercise.sets)
      .at(-1);
    const first = latest ?? context.firstPreviousSet(name);
    setInput({
      name,
      revision,
      weight: String(first?.weight ?? 20),
      reps: String(first?.reps ?? 10),
      awaitingPrevious: !first,
      editing: null,
      dirty: false,
    });
    setSelecting(false);
  }

  return (
    <section className={`session-screen${selecting ? "" : " entering-sets"}`}>
      {storageWarning && (
        <p className="error" role="alert">
          この端末に入力を保存できません。閉じる前にセットを保存してください。
        </p>
      )}
      {selecting ? (
        <>
          <div className="section-heading selection-heading session-header">
            <span className="session-wordmark">
              E-GO<span>TORE</span>
            </span>
            <ElapsedClock elapsed={elapsed} />
            <button
              type="button"
              className="text-button finish-training"
              disabled={!session || controller.busy}
              onClick={() => setFinishOpen(true)}
            >
              トレーニング終了
            </button>
          </div>
          {hasRecordedSets ? (
            <details className="today-training" aria-label="今日のトレーニング">
              <summary>
                <span className="today-training-marker" aria-hidden="true" />
                <span className="today-training-title">今日のトレーニング</span>
                <span className="today-training-summary">{sessionSummary(exercises)}</span>
              </summary>
              {exercises.map((exercise, index) => (
                <section key={`${exercise.name}-${index}`}>
                  <h2>{exercise.name}</h2>
                  {exercise.sets.map((value, setIndex) => (
                    <p key={`${exercise.name}-${setIndex}`}>
                      <span>SET {setIndex + 1}</span>
                      <SetMeasurement
                        weight={value.weight}
                        reps={value.reps}
                        best={bestPositions.get(`${index}:${setIndex}`)}
                      />
                    </p>
                  ))}
                </section>
              ))}
            </details>
          ) : (
            <section className="today-training" aria-label="今日のトレーニング">
              <div className="today-training-empty">
                <span className="today-training-title">今日のトレーニング</span>
                <span>0セット</span>
              </div>
            </section>
          )}
          {overviewBests.error && (
            <p className="error" role="alert">
              {overviewBests.error}
              <button className="text-button" type="button" onClick={overviewBests.retry}>
                再試行
              </button>
            </p>
          )}
          <div className="session-body-parts" aria-label="部位で絞り込み">
            {BODY_PARTS.map((part) => (
              <button
                type="button"
                key={part}
                aria-pressed={selectedParts.includes(part)}
                onClick={() =>
                  setSelectedParts((current) =>
                    current.includes(part)
                      ? current.filter((value) => value !== part)
                      : [...current, part],
                  )
                }
              >
                {BODY_PART_LABELS[part]}
              </button>
            ))}
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
            {candidates.map((option) => (
              <button
                type="button"
                className="v2-row"
                key={option.id}
                onClick={() => chooseExercise(option.name)}
              >
                <span className="exercise-picker-title">
                  <strong>{option.name}</strong>
                  <small className="muted">
                    {previousDays(context.previousPerformedOn(option.name))}
                  </small>
                </span>
                <span className="muted">›</span>
              </button>
            ))}
          </div>
          {!candidates.length && !catalog.loading && (
            <p className="muted">この部位の種目はありません</p>
          )}
          <button
            className="exercise-add-button"
            type="button"
            onClick={() => setCatalogOpen(true)}
          >
            ＋ 種目を追加
          </button>
        </>
      ) : (
        <>
          <div className="session-context">
            <header className="recording-header session-header">
              <span className="session-wordmark">
                E-GO<span>TORE</span>
              </span>
              <ElapsedClock elapsed={elapsed} />
              <button
                type="button"
                className="text-button finish-training"
                disabled={!session || controller.busy}
                onClick={() => setFinishOpen(true)}
              >
                トレーニング終了
              </button>
            </header>
            <button
              className="exercise-information recording-exercise-title"
              type="button"
              disabled={blocking}
              onClick={openExerciseSelection}
            >
              {input.name}
            </button>
            <section className="recording-memos memo-plain memo-inline-row" aria-label="種目メモ">
              <span className="memo-caption">種目メモ：</span>
              {context.data ? (
                <InlineMemo
                  active={active}
                  key={input.name}
                  title="種目メモ"
                  path="/exercises/memo"
                  name={input.name}
                  initial={context.data.memo}
                  userId={userId}
                  onSaved={context.retry}
                  singleLine
                />
              ) : (
                <PendingMemo title="種目メモ" content={pendingExerciseMemo} />
              )}
            </section>
            {context.error && (
              <p className="error" role="alert">
                {context.error}
                <button type="button" className="text-button" onClick={context.retry}>
                  再試行
                </button>
              </p>
            )}
          </div>
          <div className="set-comparison">
            <div className="comparison-heading">
              <div className="comparison-current-heading">
                <h2>
                  今回 <small>タップで編集</small>
                </h2>
              </div>
              <div className="comparison-previous-heading">
                <h2>
                  前回 <small>{context.data?.previous?.performed_on.replaceAll("-", "/")}</small>
                </h2>
              </div>
              <button
                type="button"
                className="previous-copy"
                aria-label="前回の全セットをコピー"
                disabled={!previous.length || blocking}
                onClick={() => void copyPreviousSets()}
              >
                ⧉
              </button>
            </div>
            <section
              className="comparison-table unified-comparison-table"
              aria-label="今回と前回の全セット"
            >
              {Array.from({ length: Math.max(sets.length, previous.length) }, (_, index) => {
                const current = sets[index];
                const prior = previous[index];
                return (
                  <div className="comparison-row" key={`set-${index + 1}`}>
                    <span>{index + 1}</span>
                    <div
                      className={`current-set-cell${input.editing === index ? " editing-set" : ""}`}
                    >
                      {current ? (
                        <>
                          <button
                            type="button"
                            disabled={controller.busy}
                            aria-label={`セット${index + 1}を編集`}
                            onClick={() => {
                              if (
                                input.editing !== null &&
                                (input.editing === index || index === sets.length - 1)
                              ) {
                                const latest = sets.at(-1) ?? current;
                                setInput({
                                  ...input,
                                  revision,
                                  weight: String(latest.weight),
                                  reps: String(latest.reps),
                                  editing: null,
                                  dirty: false,
                                });
                                setInputOpen(true);
                                return;
                              }
                              setInput({
                                ...input,
                                revision,
                                weight: String(current.weight),
                                reps: String(current.reps),
                                editing: index,
                                dirty: false,
                              });
                              setInputOpen(true);
                            }}
                          >
                            <span className="current-set-selection">
                              <SetMeasurement
                                weight={current.weight}
                                reps={current.reps}
                                best={selectedBests[index]}
                              />
                            </span>
                          </button>
                        </>
                      ) : (
                        <span className="comparison-missing">—</span>
                      )}
                    </div>
                    {current && (
                      <button
                        type="button"
                        className="delete-set"
                        disabled={controller.busy}
                        aria-label={`セット${index + 1}を削除`}
                        onClick={() => void deleteSet(index)}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
                        </svg>
                      </button>
                    )}
                    {!current && <span className="delete-set-placeholder" aria-hidden="true" />}
                    <div className="previous-set-cell">
                      {prior ? (
                        <SetMeasurement weight={prior.weight} reps={prior.reps} />
                      ) : (
                        <span className="comparison-missing">—</span>
                      )}
                    </div>
                    {prior && (
                      <button
                        type="button"
                        className="previous-copy"
                        aria-label={`前回のセット${index + 1}をコピー`}
                        onClick={() => void copyPreviousIntoNextSet(prior)}
                      >
                        ⧉
                      </button>
                    )}
                    {!prior && <span className="previous-copy-placeholder" aria-hidden="true" />}
                  </div>
                );
              })}
              {!previous.length && !sets.length && (
                <p className="comparison-empty">まだセットがありません</p>
              )}
            </section>
          </div>
          <div className="recording-entry-dock">
            <section
              className="today-exercise-memo memo-strip memo-plain memo-inline-row"
              aria-label="今日のメモ"
            >
              <span className="memo-caption">今日のメモ：</span>
              {sessionId ? (
                <InlineMemo
                  active={active}
                  title="今日のメモ"
                  path={`/sessions/${sessionId}/exercise-memo?name=${encodeURIComponent(input.name)}`}
                  userId={userId}
                  singleLine
                />
              ) : (
                <PendingMemo title="今日のメモ" content={pendingTodayMemo} />
              )}
            </section>
            {input.awaitingPrevious && (
              <output className="record-context-pending">
                <span>前回の記録を確認中…</span>
                {context.error && (
                  <span>
                    前回の記録を取得できませんでした。
                    <button type="button" className="text-button" onClick={context.retry}>
                      再試行
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setInput((current) => ({ ...current, awaitingPrevious: false }))
                      }
                    >
                      前回値なしで入力
                    </button>
                  </span>
                )}
              </output>
            )}
            <form
              hidden={input.awaitingPrevious}
              className={`set-entry${input.editing === null ? "" : " editing-input"}`}
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
                <div className="set-entry-heading">
                  <h2>{`SET ${input.editing === null ? sets.length + 1 : input.editing + 1}`}</h2>
                  <div className="set-entry-labels" aria-hidden="true">
                    <span className="number-wheel-label">
                      重量 <small>kg</small>
                    </span>
                    <span className="number-wheel-label">
                      回数 <small>回</small>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="input-toggle"
                    aria-label={inputOpen ? "入力欄をしまう" : "入力欄を開く"}
                    aria-expanded={inputOpen}
                    onClick={() => setInputOpen((open) => !open)}
                  >
                    <span aria-hidden="true">{inputOpen ? "⌄" : "⌃"}</span>
                  </button>
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
                    arrowStep={5}
                    min={0}
                    showLabel={false}
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
                    }}
                  />
                  <NumberWheel
                    label="回数"
                    inputRef={repsField}
                    onEnter={() => repsField.current?.form?.requestSubmit()}
                    unit="回"
                    value={input.reps}
                    step={1}
                    arrowStep={5}
                    min={1}
                    showLabel={false}
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
                    }}
                  />
                  <p className={`rm-estimate${candidate ? " record-candidate" : ""}`}>
                    1RM <strong>{rm ?? "—"}</strong> kg
                  </p>
                </div>
                <div className="set-actions">
                  <button
                    className="secondary next-exercise"
                    type="button"
                    onClick={openExerciseSelection}
                  >
                    次の種目へ
                  </button>
                  <button
                    className="primary"
                    type="submit"
                    disabled={!session || controller.busy}
                    aria-label={input.editing === null ? "セットを追加" : "変更を保存"}
                  >
                    {blocking ? "保存中…" : input.editing === null ? "セットを追加" : "変更を保存"}
                  </button>
                </div>
              </fieldset>
            </form>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </>
      )}
      {catalogOpen && (
        <Sheet title="種目を追加" onClose={() => setCatalogOpen(false)} dismissOnBackdrop={false}>
          <ExerciseCatalog
            options={catalog.data ?? []}
            expanded
            startAdding
            disabled={controller.busy}
            onChanged={catalog.changed}
            onAdded={() => setCatalogOpen(false)}
            initialPrimary={selectedParts.length === 1 ? selectedParts[0] : undefined}
            showAddHeading={false}
          />
        </Sheet>
      )}
      {controller.status === "conflict" && (
        <div className="sync-status" aria-live="polite">
          要確認・端末に保持
          <button type="button" className="text-button" onClick={() => setConflictOpen(true)}>
            未送信の記録を確認
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
        <FinishConfirmDialog
          session={session}
          records={finishRecords}
          dirty={input.dirty}
          busy={controller.busy}
          onClose={() => {
            if (!controller.busy) setFinishOpen(false);
          }}
          onFinish={() => {
            void (async () => {
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
            })();
          }}
        />
      )}
    </section>
  );
}

function PendingMemo({ title, content }: { title: string; content?: string }) {
  return (
    <span className="inline-memo single-line">
      <button type="button" className="memo-text" aria-label={`${title}を準備中`} disabled>
        {content || "メモ"}
      </button>
    </span>
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
        <span className={best?.weight ? "personal-best-value" : undefined}>{weight}</span>kg ×{" "}
        {reps}
        {best && <BestFlame best={best} />}
      </span>
      <small>
        RM{" "}
        <span className={best?.rm ? "personal-best-value" : undefined}>
          {displayEstimatedRM(weight, reps) ?? "—"}
        </span>
      </small>
    </span>
  );
}

function sessionSummary(exercises: TrainingSession["exercises"]) {
  const sets = exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
  const volume = exercises.reduce(
    (total, exercise) =>
      total + exercise.sets.reduce((sum, value) => sum + value.weight * value.reps, 0),
    0,
  );
  return `${exercises.length}種目　${sets}セット　${volume.toLocaleString("ja-JP")}kg`;
}

function previousDays(performedOn: string | undefined) {
  if (!performedOn) return "";
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
  const days = Math.max(
    0,
    Math.floor(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${performedOn}T00:00:00Z`)) / 86_400_000,
    ),
  );
  return days >= 10 ? "10日以上前" : `${days}日前`;
}
