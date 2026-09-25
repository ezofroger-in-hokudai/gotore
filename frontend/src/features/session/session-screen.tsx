"use client";

import type {
  BodyPart,
  ExerciseOption,
  SessionBests,
  TodayActivity,
  TrainingSession,
  Workout,
} from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { dateLabel } from "../activity/calendar";
import { BODY_PARTS, BODY_PART_LABELS, normalizeBodyPart } from "../exercises/body-parts";
import { ExerciseCatalog } from "../exercises/exercise-catalog";
import { StampControl } from "../stamps/stamp-control";
import { RecordList } from "../training/record-list";
import { useResource } from "../training/use-resource";
import { Avatar } from "../v2/avatar";
import { Sheet } from "../v2/sheet";
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
import { TrainingOverview } from "./training-overview";
import { useExerciseContext } from "./use-exercise-context";
import type { SessionController } from "./use-session";

export function SessionScreen({
  active,
  controller,
  userId,
  recent,
  onHistory,
  onFinished,
  haptic,
  catalog,
}: {
  active: boolean;
  controller: SessionController;
  userId: string;
  recent: Parameters<typeof TrainingOverview>[0]["resource"];
  onHistory: () => void;
  onFinished: (record: TrainingSession) => void;
  haptic: boolean;
  catalog: ReturnType<typeof useResource<ExerciseOption[]>>;
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
  catalog: ReturnType<typeof useResource<ExerciseOption[]>>;
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
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(true);
  const repsField = useRef<HTMLInputElement>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const adding = useRef(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [selectedParts, setSelectedParts] = useState<BodyPart[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [openedPeer, setOpenedPeer] = useState<{ groupId: string; workoutId: string } | null>(null);
  const overviewBests = useResource<SessionBests>(
    sessionId ? `/sessions/${sessionId}/bests` : null,
    controller.confirmedRevision,
    false,
    true,
    { enabled: active && selecting && exercises.length > 0 },
  );
  const bestPositions = new Set(
    overviewBests.data && overviewBests.data.revision === revision && !controller.pending
      ? overviewBests.data.sets.map((set) => `${set.exercise_index}:${set.set_index}`)
      : [],
  );
  const candidates = (catalog.data ?? [])
    .filter(
      (option) =>
        selectedParts.length === 0 ||
        selectedParts.includes(normalizeBodyPart(option.primary_body_part)),
    )
    .toSorted((left, right) => {
      const leftUsed = exercises.some((exercise) => exercise.name === left.name);
      const rightUsed = exercises.some((exercise) => exercise.name === right.name);
      return Number(rightUsed) - Number(leftUsed) || left.name.localeCompare(right.name, "ja");
    });
  const context = useExerciseContext(
    sessionId,
    input.name,
    candidates.map((candidate) => candidate.name).filter((name) => name !== input.name),
    controller.confirmedRevision,
    active,
  );
  const todayActivity = useResource<TodayActivity>(
    sessionId ? "/groups/today-activity" : null,
    controller.confirmedRevision,
    10_000,
    true,
    { enabled: active && selecting, retainOnRefresh: true },
  );
  const peerRecord = useResource<Workout>(
    openedPeer ? `/groups/${openedPeer.groupId}/workouts/${openedPeer.workoutId}` : null,
    0,
    false,
    true,
    { enabled: active && !!openedPeer, retainOnRefresh: true },
  );
  const sets = exercises.filter((e) => e.name === input.name).flatMap((e) => e.sets);
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
    if (!session || !storageKey || controller.busy || stale || adding.current) return;
    adding.current = true;
    setError("");
    try {
      const value = setValue(input.weight, input.reps);
      const nextExercises = updateSet(exercises, input.name, value, input.editing);
      const result = await controller.save(nextExercises, revision);
      const nextInput = { ...input, revision: result.revision, editing: null, dirty: false };
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
      !window.confirm("未保存の入力を破棄して種目を変更しますか？")
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
            <button
              type="button"
              className="text-button finish-training"
              disabled={!session || controller.busy}
              onClick={() => setFinishOpen(true)}
            >
              トレーニング終了
            </button>
          </div>
          <section className="training-peers" aria-label="今日の仲間">
            <div className="peer-groups" role="tablist" aria-label="仲間のグループ">
              <button
                type="button"
                role="tab"
                aria-selected={selectedGroup === "all"}
                onClick={() => setSelectedGroup("all")}
              >
                すべて
              </button>
              {(todayActivity.data?.groups ?? []).map((group) => (
                <button
                  type="button"
                  role="tab"
                  key={group.group_id}
                  aria-selected={selectedGroup === group.group_id}
                  onClick={() => setSelectedGroup(group.group_id)}
                >
                  {group.name}
                </button>
              ))}
            </div>
            <div className="peer-avatars">
              {todayActivity.data
                ? peerItems(todayActivity.data, selectedGroup).map((peer) => (
                    <button
                      className="peer-avatar-button"
                      type="button"
                      key={`${peer.groupId}:${peer.workoutId}`}
                      aria-label={`${peer.name}の今日の記録を開く`}
                      onClick={() =>
                        setOpenedPeer({ groupId: peer.groupId, workoutId: peer.workoutId })
                      }
                    >
                      <span className="peer-avatar-wrap">
                        <Avatar
                          userId={peer.userId}
                          name={peer.name}
                          version={peer.avatarVersion}
                          live={peer.live}
                        />
                        {peer.best && (
                          <span className="peer-best" aria-label="最高記録を更新">
                            🔥
                          </span>
                        )}
                      </span>
                    </button>
                  ))
                : ["first", "second", "third"].map((key) => (
                    <span className="peer-avatar-placeholder" key={key} />
                  ))}
            </div>
          </section>
          <details className="today-training" aria-label="今日のトレーニング">
            <summary>
              <span>今日のトレーニング</span>
              <span>{sessionSummary(exercises)}</span>
              <span aria-hidden="true">…</span>
            </summary>
            {exercises.map((exercise, index) => (
              <section key={`${exercise.name}-${index}`}>
                <h2>{exercise.name}</h2>
                {exercise.sets.map((value, setIndex) => (
                  <p key={`${exercise.name}-${setIndex}`}>
                    <span>SET {setIndex + 1}</span>
                    <SetMeasurement weight={value.weight} reps={value.reps} />
                  </p>
                ))}
              </section>
            ))}
          </details>
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
                <span className="memo-text muted">メモを読み込み中…</span>
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
                              <SetMeasurement weight={current.weight} reps={current.reps} />
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
                  title="今日のメモ"
                  path={`/sessions/${sessionId}/exercise-memo?name=${encodeURIComponent(input.name)}`}
                  userId={userId}
                  singleLine
                />
              ) : (
                <span className="memo-text muted">メモを読み込み中…</span>
              )}
            </section>
            <form
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
        <Sheet title="種目を追加" onClose={() => setCatalogOpen(false)}>
          <ExerciseCatalog
            options={catalog.data ?? []}
            expanded
            startAdding
            disabled={controller.busy}
            onChanged={catalog.retry}
            onAdded={() => setCatalogOpen(false)}
            initialPrimary={selectedParts.length === 1 ? selectedParts[0] : undefined}
            showAddHeading={false}
          />
        </Sheet>
      )}
      {openedPeer && (
        <Sheet
          title={peerRecord.data ? dateLabel(peerRecord.data.performed_on) : "記録"}
          onClose={() => setOpenedPeer(null)}
        >
          {peerRecord.error ? (
            <p className="error" role="alert">
              {peerRecord.error}
              <button type="button" className="text-button" onClick={peerRecord.retry}>
                再試行
              </button>
            </p>
          ) : peerRecord.data ? (
            <RecordList
              records={[peerRecord.data]}
              empty=""
              showDate={false}
              headerControl={(workout) => (
                <StampControl
                  groupId={openedPeer.groupId}
                  workoutId={workout.id}
                  name={workout.display_name}
                  direct
                />
              )}
            />
          ) : (
            <div className="peer-record-placeholder" aria-label="記録を読み込み中" />
          )}
        </Sheet>
      )}
      {(controller.status === "offline" || controller.status === "conflict") && (
        <div className="sync-status" aria-live="polite">
          {controller.status === "offline" ? "未送信・端末に保持" : "要確認・端末に保持"}
          {controller.status === "offline" && (
            <button type="button" className="text-button" onClick={() => void controller.sync()}>
              再送
            </button>
          )}
          {controller.status === "conflict" && (
            <button type="button" className="text-button" onClick={() => setConflictOpen(true)}>
              未送信の記録を確認
            </button>
          )}
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
          onClose={() => {
            if (!controller.busy) setFinishOpen(false);
          }}
        >
          {input.dirty && <p>未保存の入力があります。保存済みのセットだけを残して終了しますか？</p>}
          <button
            className="secondary full"
            type="button"
            disabled={controller.busy}
            onClick={() => setFinishOpen(false)}
          >
            トレーニングに戻る
          </button>
          <button
            className="primary full finish-confirm"
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
        </Sheet>
      )}
    </section>
  );
}

function SetMeasurement({ weight, reps }: { weight: number; reps: number }) {
  return (
    <span className="set-measurement">
      <span>
        {weight}kg × {reps}
      </span>
      <small>RM {displayEstimatedRM(weight, reps) ?? "—"}</small>
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

function peerItems(data: TodayActivity, selectedGroup: string) {
  const peers = new Map<
    string,
    {
      groupId: string;
      workoutId: string;
      userId: string;
      name: string;
      avatarVersion?: string | null;
      live: boolean;
      best: boolean;
      updatedAt: string;
    }
  >();
  for (const group of data.groups) {
    if (selectedGroup !== "all" && selectedGroup !== group.group_id) continue;
    for (const feed of group.feed) {
      const current = peers.get(feed.user_id);
      if (current && current.updatedAt >= feed.updated_at) continue;
      const member = group.members.find((item) => item.id === feed.user_id);
      peers.set(feed.user_id, {
        groupId: group.group_id,
        workoutId: feed.workout_id,
        userId: feed.user_id,
        name: feed.display_name,
        avatarVersion: member?.avatar_version,
        live: member?.live ?? false,
        best: feed.best,
        updatedAt: feed.updated_at,
      });
    }
  }
  return [...peers.values()].toSorted(
    (left, right) =>
      Number(right.live) - Number(left.live) || right.updatedAt.localeCompare(left.updatedAt),
  );
}
