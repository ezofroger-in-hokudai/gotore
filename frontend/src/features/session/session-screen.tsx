"use client";

import type { ExerciseOption, SessionBests, TrainingSession } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExerciseCatalog } from "../exercises/exercise-catalog";
import { useResource } from "../training/use-resource";
import { Sheet } from "../v2/sheet";
import { InlineMemo } from "./inline-memo";
import { NumberWheel } from "./number-wheel";
import {
  type SessionInput,
  bestUpdate,
  emptyInput,
  estimatedRM,
  readSessionInput,
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
}: {
  active: boolean;
  controller: SessionController;
  userId: string;
  recent: Parameters<typeof TrainingOverview>[0]["resource"];
  onHistory: () => void;
  onFinished: (record: TrainingSession) => void;
  haptic: boolean;
}) {
  const { session } = controller;
  const catalog = useResource<ExerciseOption[]>("/exercise-options", 0, false, true);
  const [draft, setDraft] = useState<SessionInput>({ ...emptyInput });
  if (!session && !controller.startingId)
    return (
      <section className="start-training">
        <h1>トレーニング</h1>
        <p>今日も、自分のペースで。</p>
        <p className="muted">開始時の全所属グループに共有します。メモは自分だけに保存されます。</p>
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
  const comparisonTable = useRef<HTMLElement>(null);
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
  const names = Array.from(
    new Set([...(catalog.data ?? []).map((e) => e.name), ...exercises.map((e) => e.name)]),
  );
  const context = useExerciseContext(
    sessionId,
    input.name,
    names.filter((name) => name !== input.name && (!selecting || name.includes(query.trim()))),
    controller.confirmedRevision,
    active,
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
      const nextInput = { ...input, revision: result.revision, editing: null, dirty: false };
      setInput(nextInput);
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextInput));
      } catch {
        setStorageWarning(true);
      }
      requestAnimationFrame(() => {
        const table = comparisonTable.current;
        if (table && input.editing === null) table.scrollTop = table.scrollHeight;
      });
      setFeedback(input.editing === null ? "追加しました" : "更新しました");
      if (haptic && typeof navigator.vibrate === "function") navigator.vibrate(15);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存できませんでした。");
    } finally {
      adding.current = false;
    }
  }
  const candidate =
    input.editing === null && bestUpdate(Number(input.weight), Number(input.reps), context.data);
  const rm = estimatedRM(Number(input.weight), Number(input.reps));
  const awaitingSave = submission && controller.confirmedRevision < submission.revision;
  const celebrated =
    !!submission &&
    controller.saved?.revision === submission.revision &&
    controller.saved.best_updated &&
    feedback === "保存しました" &&
    !awaitingSave;

  return (
    <section className={`session-screen${selecting ? "" : " entering-sets"}`}>
      <div className="section-heading">
        <span className="eyebrow">
          {session
            ? `${session.performed_on.replaceAll("-", "/")} · トレーニング中`
            : controller.busy
              ? "開始中…"
              : "開始を再試行してください"}
        </span>
        <button
          type="button"
          className="secondary finish-training"
          disabled={!session || controller.busy}
          onClick={() => setFinishOpen(true)}
        >
          トレーニング終了
        </button>
      </div>
      {storageWarning && (
        <p className="error" role="alert">
          この端末に入力を保存できません。閉じる前にセットを保存してください。
        </p>
      )}
      {selecting ? (
        <>
          <div className="section-heading">
            <h1>種目を選択</h1>
            <button className="text-button" type="button" onClick={() => setCatalogOpen(true)}>
              種目一覧
            </button>
          </div>
          <section className="session-overview" aria-label="今回のトレーニング">
            <h2>今回のトレーニング</h2>
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
                          <span role="img" aria-label="最高記録">
                            🔥{" "}
                          </span>
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
          {catalog.error && (
            <p role="alert" className="error">
              {catalog.error}
              <button type="button" className="text-button" onClick={catalog.retry}>
                再試行
              </button>
            </p>
          )}
          <div className="v2-rows">
            {names
              .filter((name) => name.includes(query.trim()))
              .map((name) => (
                <button
                  type="button"
                  className="v2-row"
                  key={name}
                  onClick={() => {
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
                      .filter((e) => e.name === name)
                      .flatMap((e) => e.sets)
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
                    setFeedback("");
                    setSubmission(null);
                    setUndo(null);
                  }}
                >
                  <span>{name}</span>
                  <span className="muted">
                    {exercises.find((e) => e.name === name)?.sets.length || ""} ›
                  </span>
                </button>
              ))}
          </div>
          {!names.length && !catalog.loading && (
            <p className="muted">種目一覧から種目を追加してください。</p>
          )}
          <button className="secondary full" type="button" onClick={() => setCatalogOpen(true)}>
            新しい種目を追加
          </button>
        </>
      ) : (
        <>
          <div className="session-context">
            <div className="section-heading">
              <h1>{input.name}</h1>
              <button
                className="text-button"
                type="button"
                disabled={blocking}
                onClick={() => setSelecting(true)}
              >
                種目を変更
              </button>
              <button type="button" className="text-button" onClick={() => setCatalogOpen(true)}>
                種目一覧
              </button>
            </div>
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
            <div className="exercise-memo-slot">
              {context.data ? (
                <InlineMemo
                  key={input.name}
                  title="種目メモ"
                  path="/exercises/memo"
                  name={input.name}
                  initial={context.data.memo}
                  userId={userId}
                  onSaved={context.retry}
                />
              ) : (
                <span className="memo-text muted">
                  {context.error ? "メモ未取得" : "メモを読み込み中…"}
                </span>
              )}
            </div>
            {context.data?.previous && (
              <InlineMemo
                key={context.data.previous.id}
                title="前回のメモ"
                path={`/workouts/${context.data.previous.id}/memo`}
                userId={userId}
                omitWhenEmpty
              />
            )}
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
              <h2>
                前回 <small>{context.data?.previous?.performed_on.replaceAll("-", "/")}</small>
              </h2>
              <h2>
                今回 <small>タップで編集</small>
              </h2>
            </div>
            <section className="comparison-table" ref={comparisonTable} aria-label="全セットの比較">
              {Array.from({ length: Math.max(previous.length, sets.length, 1) }, (_, i) => (
                <div className="comparison-row" key={`set-${i + 1}`}>
                  <span>{i + 1}</span>
                  <div>
                    {previous[i] ? (
                      <SetMeasurement weight={previous[i].weight} reps={previous[i].reps} />
                    ) : (
                      "—"
                    )}
                  </div>
                  <button
                    type="button"
                    className={input.editing === i ? "editing-set" : ""}
                    disabled={!sets[i] || controller.busy}
                    aria-label={`セット${i + 1}を編集`}
                    onClick={() => {
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
                    {sets[i] ? <SetMeasurement weight={sets[i].weight} reps={sets[i].reps} /> : "—"}
                  </button>
                </div>
              ))}
            </section>
          </div>
          {sessionId ? (
            <InlineMemo title="今回のメモ" path={`/workouts/${sessionId}/memo`} userId={userId} />
          ) : (
            <span className="memo-text muted">メモ</span>
          )}
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
            <fieldset disabled={blocking || stale || controller.status === "conflict"}>
              <div className="section-heading">
                <h2>
                  {input.editing === null
                    ? `SET ${sets.length + 1}`
                    : `SET ${input.editing + 1} を編集`}
                </h2>
                {input.editing === null && undo && undo.revision === revision && (
                  <button
                    className="text-button undo-button"
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
                    直前の保存を取り消す
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
                  step={2.5}
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
              <p className={`rm-estimate${candidate ? " record-candidate" : ""}`}>
                1RM <strong>{rm ?? "—"}</strong> kg <span>（1〜10回）</span>
              </p>
              <div className="save-feedback" aria-live="polite">
                {feedback ? (
                  <span className={celebrated ? "record-celebration" : undefined}>
                    {celebrated && (
                      <span role="img" aria-label="最高記録">
                        🔥{" "}
                      </span>
                    )}
                    {submission && !feedback.startsWith("直前") && (
                      <span>SET {submission.set} · </span>
                    )}
                    <span>
                      {awaitingSave
                        ? controller.status === "offline" || controller.status === "conflict"
                          ? "端末に保存 · 未送信"
                          : "端末に保存 · 保存中…"
                        : feedback}
                    </span>
                  </span>
                ) : (
                  ""
                )}
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
                  aria-label={input.editing === null ? "次のセットへ" : "変更を保存"}
                >
                  <span>
                    {blocking ? "保存中…" : input.editing === null ? "次のセットへ" : "変更を保存"}
                  </span>
                  <small>SET {(input.editing ?? sets.length) + 1}を記録</small>
                </button>
              </div>
            </fieldset>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </>
      )}
      {catalogOpen && (
        <Sheet title="種目一覧" onClose={() => setCatalogOpen(false)}>
          <ExerciseCatalog
            options={catalog.data ?? []}
            expanded
            disabled={controller.busy}
            onChanged={catalog.retry}
          />
        </Sheet>
      )}
      <div className="sync-status" aria-live="polite">
        {!session ? (
          controller.busy ? (
            "開始中…"
          ) : (
            <button
              type="button"
              className="text-button"
              disabled={!controller.ready}
              onClick={() => void controller.start().catch(() => {})}
            >
              開始を再試行
            </button>
          )
        ) : controller.pending ? (
          `${controller.pending}件 ${controller.status === "offline" ? "未送信・端末に保持" : controller.status === "conflict" ? "要確認・端末に保持" : "同期中"}`
        ) : (
          `同期済み · ${session.shared_group_ids?.length ?? 0}グループに共有`
        )}
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
          <p>
            {input.dirty
              ? "未保存の入力があります。保存済みのセットだけを残して終了しますか？"
              : "おつかれさまでした。保存したセットは履歴で確認できます。"}
          </p>
          <button
            className="primary full"
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
      <small>RM {estimatedRM(weight, reps) ?? "—"}</small>
    </span>
  );
}
