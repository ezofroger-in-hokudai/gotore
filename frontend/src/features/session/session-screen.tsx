"use client";

import type { ExerciseContext, ExerciseOption, TrainingSession } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExerciseCatalog } from "../exercises/exercise-catalog";
import { useResource } from "../training/use-resource";
import { Sheet } from "../v2/sheet";
import { InlineMemo } from "./inline-memo";
import { NumberWheel } from "./number-wheel";
import { bestUpdate, estimatedRM, readSessionInput, setValue, updateSet } from "./session";
import type { SessionController } from "./use-session";

export function SessionScreen({
  controller,
  userId,
  onFinished,
  haptic,
}: {
  controller: SessionController;
  userId: string;
  onFinished: () => void;
  haptic: boolean;
}) {
  const { session } = controller;
  const catalog = useResource<ExerciseOption[]>("/exercise-options", 0, false, true);
  const [starting, setStarting] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  if (!session)
    return (
      <section className="start-training">
        <h1>トレーニング</h1>
        <p>種目を選んで、今日の1セットを。</p>
        <p className="muted">開始時の全所属グループに共有します。メモは自分だけに保存されます。</p>
        <button
          className="primary full"
          type="button"
          disabled={!controller.ready || controller.busy}
          onClick={() => {
            setStarting(true);
            void controller.start().catch(() => {});
          }}
        >
          {controller.busy ? "開始中…" : "トレーニングを開始"}
        </button>
        {starting && (
          <div className="v2-rows" aria-label="開始中の種目選択">
            {catalog.data?.map((option) => (
              <button
                key={option.id}
                type="button"
                className="v2-row"
                aria-pressed={selectedName === option.name}
                onClick={() => setSelectedName(option.name)}
              >
                {option.name} {selectedName === option.name ? "✓" : ""}
              </button>
            ))}
            {!catalog.data && <p className="muted">{catalog.error || "種目を読み込み中…"}</p>}
            {catalog.error && (
              <button type="button" onClick={catalog.retry}>
                種目を再試行
              </button>
            )}
          </div>
        )}
      </section>
    );
  return (
    <ActiveTraining
      key={session.id}
      session={session}
      controller={controller}
      userId={userId}
      onFinished={() => {
        setStarting(false);
        setSelectedName("");
        onFinished();
      }}
      haptic={haptic}
      initialName={selectedName}
      catalog={catalog}
    />
  );
}

function ActiveTraining({
  session,
  controller,
  userId,
  onFinished,
  haptic,
  initialName,
  catalog,
}: {
  session: TrainingSession;
  initialName: string;
  catalog: ReturnType<typeof useResource<ExerciseOption[]>>;
  controller: SessionController;
  userId: string;
  onFinished: () => void;
  haptic: boolean;
}) {
  const storageKey = `gotore:session-input:v2:${userId}:${session.id}`;
  const [input, setInput] = useState(() => {
    try {
      const saved = readSessionInput(localStorage.getItem(storageKey));
      return saved.name ? saved : { ...saved, name: initialName };
    } catch {
      return readSessionInput(null);
    }
  });
  const [selecting, setSelecting] = useState(!input.name);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const comparisonTable = useRef<HTMLElement>(null);
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
  const context = useResource<ExerciseContext>(
    input.name
      ? `/exercises/context?name=${encodeURIComponent(input.name)}&session_id=${session.id}`
      : null,
    controller.confirmedRevision,
    false,
    true,
    { retainOnRefresh: true },
  );
  const sets = session.exercises.filter((e) => e.name === input.name).flatMap((e) => e.sets);
  const previous = context.data?.previous?.sets ?? [];
  const names = Array.from(
    new Set([...(catalog.data ?? []).map((e) => e.name), ...session.exercises.map((e) => e.name)]),
  );

  const latestInput = useRef(input);
  latestInput.current = input;
  const persistInput = useCallback(() => {
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
      controller.saved?.id === session.id &&
      controller.saved.revision >= submission.revision
    )
      setFeedback((current) =>
        current.startsWith("直前")
          ? current
          : controller.saved?.best_updated
            ? "BEST更新！ 保存しました"
            : "保存しました",
      );
  }, [controller.saved, session.id, submission]);
  // 応答だけ失われた保存は、再起動時にサーバーと照合して二重追加を防ぐ。
  useEffect(() => {
    try {
      const pending = JSON.parse(localStorage.getItem(`${storageKey}:pending`) || "null");
      if (
        pending &&
        pending.revision + 1 === session.revision &&
        JSON.stringify(pending.exercises) === JSON.stringify(session.exercises)
      ) {
        localStorage.removeItem(`${storageKey}:pending`);
        setInput((value) => ({
          ...value,
          revision: session.revision,
          editing: null,
          dirty: false,
        }));
        setFeedback("前回の保存を確認しました");
      }
    } catch {
      setStorageWarning(true);
    }
  }, [storageKey, session.revision, session.exercises]);
  const stale =
    input.revision !== undefined &&
    input.revision !== session.revision &&
    (input.dirty || input.editing !== null);

  async function save() {
    if (controller.busy || stale || adding.current) return;
    adding.current = true;
    setError("");
    try {
      const value = setValue(input.weight, input.reps);
      const exercises = updateSet(session.exercises, input.name, value, input.editing);
      const result = await controller.save(exercises, session.revision);
      setSubmission({ revision: result.revision, set: (input.editing ?? sets.length) + 1 });
      setUndo({ exercises: session.exercises, revision: result.revision });
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
  const celebrated = feedback.startsWith("BEST") && !awaitingSave;

  return (
    <section className={`session-screen${selecting ? "" : " entering-sets"}`}>
      <div className="section-heading">
        <span className="eyebrow">
          {session.performed_on.replaceAll("-", "/")} · トレーニング中
        </span>
        <button
          type="button"
          className="secondary finish-training"
          disabled={controller.busy}
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
            {session.exercises.length ? (
              session.exercises.map((exercise, index) => (
                <div key={`${exercise.name}-${index}`}>
                  <h3>
                    {exercise.name} · {exercise.sets.length}セット
                  </h3>
                  <ol>
                    {exercise.sets.map((value, i) => (
                      <li key={`set-${i + 1}`}>
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
                    const latest = session.exercises
                      .filter((e) => e.name === name)
                      .flatMap((e) => e.sets)
                      .at(-1);
                    setInput({
                      name,
                      revision: session.revision,
                      weight: String(latest?.weight ?? 20),
                      reps: String(latest?.reps ?? 10),
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
                    {session.exercises.find((e) => e.name === name)?.sets.length || ""} ›
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
                disabled={controller.busy}
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
              <div className="comparison-labels">
                <span>SET</span>
                <span>重量 × 回数 / RM</span>
                <span>重量 × 回数 / RM</span>
              </div>
              {Array.from({ length: Math.max(previous.length, sets.length, 1) }, (_, i) => (
                <div className="comparison-row" key={`set-${i + 1}`}>
                  <span>{i + 1}</span>
                  <div>
                    {previous[i] ? (
                      <>
                        {previous[i].weight}kg × {previous[i].reps}
                        <small>RM {estimatedRM(previous[i].weight, previous[i].reps) ?? "—"}</small>
                      </>
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
                        revision: session.revision,
                        weight: String(sets[i].weight),
                        reps: String(sets[i].reps),
                        editing: i,
                        dirty: false,
                      });
                      setFeedback("");
                    }}
                  >
                    {sets[i] ? (
                      <>
                        {sets[i].weight}kg × {sets[i].reps}
                        <small>RM {estimatedRM(sets[i].weight, sets[i].reps) ?? "—"}</small>
                      </>
                    ) : (
                      "—"
                    )}
                  </button>
                </div>
              ))}
            </section>
          </div>
          <InlineMemo title="今回のメモ" path={`/workouts/${session.id}/memo`} userId={userId} />
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
                  onClick={() => setInput({ ...input, editing: null, revision: session.revision })}
                >
                  新しいセットとして入力
                </button>
              </p>
            )}
            <fieldset disabled={controller.busy || stale || controller.status === "conflict"}>
              <div className="section-heading">
                <h2>
                  {input.editing === null
                    ? `SET ${sets.length + 1}`
                    : `SET ${input.editing + 1} を編集`}
                </h2>
                {input.editing === null && undo && undo.revision === session.revision && (
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
                        revision: session.revision,
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
                  unit="kg"
                  value={input.weight}
                  step={2.5}
                  min={0}
                  onChange={(weight) => {
                    setInput({
                      ...input,
                      revision:
                        input.dirty || input.editing !== null
                          ? (input.revision ?? session.revision)
                          : session.revision,
                      weight,
                      dirty: true,
                    });
                    setFeedback("");
                  }}
                />
                <NumberWheel
                  label="回数"
                  unit="回"
                  value={input.reps}
                  step={1}
                  min={1}
                  onChange={(reps) => {
                    setInput({
                      ...input,
                      revision:
                        input.dirty || input.editing !== null
                          ? (input.revision ?? session.revision)
                          : session.revision,
                      reps,
                      dirty: true,
                    });
                    setFeedback("");
                  }}
                />
              </div>
              <p className="rm-estimate">
                1RM <strong>{rm ?? "—"}</strong> kg <span>（1〜10回）</span>
              </p>
              <div className="save-feedback" aria-live="polite">
                {feedback ? (
                  <span className={celebrated ? "record-celebration" : undefined}>
                    {celebrated && <span aria-hidden="true">🔥 </span>}
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
                ) : candidate ? (
                  <span className="best-badge">BEST更新候補</span>
                ) : (
                  ""
                )}
              </div>
              <div className="set-actions">
                <button
                  className="primary"
                  type="submit"
                  aria-label={input.editing === null ? "次のセットへ" : "変更を保存"}
                >
                  <span>
                    {controller.busy
                      ? "保存中…"
                      : input.editing === null
                        ? "次のセットへ"
                        : "変更を保存"}
                  </span>
                  <small>SET {(input.editing ?? sets.length) + 1}を記録</small>
                </button>
                <button
                  className="secondary next-exercise"
                  type="button"
                  onClick={() => setSelecting(true)}
                >
                  次の種目へ<span aria-hidden="true"> ›</span>
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
        {controller.pending
          ? `${controller.pending}件 ${controller.status === "offline" ? "未送信・端末に保持" : controller.status === "conflict" ? "要確認・端末に保持" : "同期中"}`
          : `同期済み · ${session.shared_group_ids?.length ?? 0}グループに共有`}
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
            value={session.exercises
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
      {finishOpen && (
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
                await controller.finish();
                try {
                  localStorage.removeItem(storageKey);
                } catch {}
                onFinished();
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
