"use client";

import { type ExerciseContext, type ExerciseOption, type TrainingSession, api } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { ExerciseCatalog } from "../exercises/exercise-catalog";
import { useResource } from "../training/use-resource";
import { WorkoutMemo } from "../training/workout-memo";
import { Sheet } from "../v2/sheet";
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
          onClick={() => void controller.start().catch(() => {})}
        >
          トレーニングを開始
        </button>
      </section>
    );
  return (
    <ActiveTraining
      key={session.id}
      session={session}
      controller={controller}
      userId={userId}
      onFinished={onFinished}
      haptic={haptic}
    />
  );
}

function ActiveTraining({
  session,
  controller,
  userId,
  onFinished,
  haptic,
}: {
  session: TrainingSession;
  controller: SessionController;
  userId: string;
  onFinished: () => void;
  haptic: boolean;
}) {
  const storageKey = `gotore:session-input:v2:${userId}:${session.id}`;
  const [input, setInput] = useState(() => {
    try {
      return readSessionInput(localStorage.getItem(storageKey));
    } catch {
      return readSessionInput(null);
    }
  });
  const [selecting, setSelecting] = useState(!input.name);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [undo, setUndo] = useState<{
    exercises: TrainingSession["exercises"];
    revision: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  const catalog = useResource<ExerciseOption[]>("/exercise-options");
  const context = useResource<ExerciseContext>(
    input.name
      ? `/exercises/context?name=${encodeURIComponent(input.name)}&session_id=${session.id}`
      : null,
    session.revision,
  );
  const sets = session.exercises.filter((e) => e.name === input.name).flatMap((e) => e.sets);
  const previous = context.data?.previous?.sets ?? [];
  const names = Array.from(
    new Set([...(catalog.data ?? []).map((e) => e.name), ...session.exercises.map((e) => e.name)]),
  );

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(input));
    } catch {
      setStorageWarning(true);
    }
  }, [input, storageKey]);
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
    if (controller.busy || stale) return;
    setError("");
    try {
      const value = setValue(input.weight, input.reps);
      const exercises = updateSet(session.exercises, input.name, value, input.editing);
      try {
        localStorage.setItem(
          `${storageKey}:pending`,
          JSON.stringify({ revision: session.revision, exercises }),
        );
      } catch {
        setStorageWarning(true);
      }
      const result = await controller.save(exercises);
      try {
        localStorage.removeItem(`${storageKey}:pending`);
      } catch {
        setStorageWarning(true);
      }
      setUndo({ exercises: session.exercises, revision: result.revision });
      setInput((i) => ({ ...i, revision: result.revision, editing: null, dirty: false }));
      setFeedback(
        input.editing === null && result.best_updated
          ? "BEST更新！ 保存しました"
          : input.editing === null
            ? "保存しました"
            : "更新しました",
      );
      if (haptic && typeof navigator.vibrate === "function") navigator.vibrate(15);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存できませんでした。");
    }
  }
  const candidate =
    input.editing === null && bestUpdate(Number(input.weight), Number(input.reps), context.data);
  const rm = estimatedRM(Number(input.weight), Number(input.reps));

  return (
    <section className="session-screen">
      <div className="section-heading">
        <span className="eyebrow">
          {session.performed_on.replaceAll("-", "/")} · トレーニング中
        </span>
        <button
          className="text-button"
          type="button"
          disabled={controller.busy}
          onClick={() => setCatalogOpen(true)}
        >
          種目一覧
        </button>
      </div>
      {storageWarning && (
        <p className="error" role="alert">
          この端末に入力を保存できません。閉じる前にセットを保存してください。
        </p>
      )}
      {selecting ? (
        <>
          <h1>種目を選択</h1>
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
        </>
      ) : (
        <>
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
          </div>
          <button
            type="button"
            className="exercise-memo-preview"
            onClick={() => setMemoOpen(true)}
            disabled={!context.data}
          >
            <span>{context.data?.memo.content || "種目メモを追加"}</span>
            <span>編集</span>
          </button>
          <div className="personal-bests">
            <div>
              <span>最高重量</span>
              <strong>
                {context.data?.best_weight ?? "—"}
                <small> kg</small>
              </strong>
            </div>
            <div>
              <span>推定1RM</span>
              <strong>
                {context.data?.best_rm ?? "—"}
                <small> kg</small>
              </strong>
            </div>
          </div>
          {context.error && (
            <p className="error" role="alert">
              {context.error}
              <button type="button" className="text-button" onClick={context.retry}>
                再試行
              </button>
            </p>
          )}
          <div className="comparison-heading">
            <h2>
              前回 <small>{context.data?.previous?.performed_on.replaceAll("-", "/")}</small>
            </h2>
            <h2>
              今回 <small>タップで編集</small>
            </h2>
          </div>
          <div className="comparison-table">
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
          </div>
          {context.data?.previous && (
            <details className="previous-memo">
              <summary>前回のメモ（自分だけ）</summary>
              <WorkoutMemo workoutId={context.data.previous.id} />
            </details>
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
                  onClick={() => setInput({ ...input, editing: null, revision: session.revision })}
                >
                  新しいセットとして入力
                </button>
              </p>
            )}
            <fieldset disabled={controller.busy || stale}>
              <div className="section-heading">
                <h2>
                  {input.editing === null
                    ? `SET ${sets.length + 1}`
                    : `SET ${input.editing + 1} を編集`}
                </h2>
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
                推定1RM <strong>{rm ?? "—"}</strong> kg <span>（1〜10回）</span>
              </p>
              <div className="save-feedback" aria-live="polite">
                {feedback || (candidate ? <span className="best-badge">BEST更新候補</span> : "")}
              </div>
              <button className="primary full" type="submit">
                {controller.busy
                  ? "保存中…"
                  : input.editing === null
                    ? "このセットを保存"
                    : "変更を保存"}
              </button>
            </fieldset>
          </form>
          {undo && undo.revision === session.revision && (
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
                } catch {
                  /* 共通の通信エラーを表示する。 */
                }
              }}
            >
              直前の保存を取り消す
            </button>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <details className="session-memo">
            <summary>今回のメモ（自分だけ）</summary>
            <WorkoutMemo workoutId={session.id} />
          </details>
        </>
      )}
      <button
        type="button"
        className="secondary full finish-training"
        disabled={controller.busy}
        onClick={() => setFinishOpen(true)}
      >
        トレーニングを終了
      </button>
      <p className="sharing-caption">
        {session.shared_group_ids?.length
          ? `${session.shared_group_ids.length}グループに共有中`
          : "自分だけのトレーニング"}{" "}
        · 保存済みのセットは閉じても残ります
      </p>
      {catalogOpen && (
        <Sheet title="種目一覧" onClose={() => setCatalogOpen(false)}>
          <ExerciseCatalog
            options={catalog.data ?? []}
            disabled={controller.busy}
            onChanged={catalog.retry}
          />
        </Sheet>
      )}
      {memoOpen && context.data && (
        <Sheet title="種目メモ" onClose={() => setMemoOpen(false)}>
          <ExerciseMemo
            name={input.name}
            initial={context.data.memo}
            onSaved={() => {
              context.retry();
              setMemoOpen(false);
            }}
          />
        </Sheet>
      )}
      {finishOpen && (
        <Sheet
          title="トレーニングを終了"
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
            終了する
          </button>
        </Sheet>
      )}
    </section>
  );
}

function NumberWheel({
  label,
  unit,
  value,
  step,
  min,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  step: number;
  min: number;
  onChange: (value: string) => void;
}) {
  const number = Number(value) || 0;
  const touch = useRef<number | null>(null);
  const shift = (delta: number) =>
    onChange(String(Math.round(Math.min(1000, Math.max(min, number + delta)) * 10) / 10));
  return (
    <div
      className="number-wheel"
      onTouchStart={(e) => {
        touch.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        if (touch.current !== null) {
          const delta = touch.current - e.changedTouches[0].clientY;
          if (Math.abs(delta) > 20) shift(delta > 0 ? step : -step);
          touch.current = null;
        }
      }}
    >
      <label htmlFor={`set-${unit}`}>
        {label}
        <small>{unit}</small>
      </label>
      <button
        type="button"
        className="wheel-neighbor"
        aria-label={`${label}を減らす`}
        disabled={number <= min}
        onClick={() => shift(-step)}
      >
        {Math.round(Math.max(min, number - step) * 10) / 10}
      </button>
      <input
        id={`set-${unit}`}
        aria-label={label}
        type="number"
        inputMode={unit === "kg" ? "decimal" : "numeric"}
        min={min}
        max={1000}
        step={unit === "kg" ? 0.1 : 1}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="wheel-neighbor"
        aria-label={`${label}を増やす`}
        disabled={number >= 1000}
        onClick={() => shift(step)}
      >
        {Math.round(Math.min(1000, number + step) * 10) / 10}
      </button>
    </div>
  );
}

function ExerciseMemo({
  name,
  initial,
  onSaved,
}: { name: string; initial: ExerciseContext["memo"]; onSaved: () => void }) {
  const [content, setContent] = useState(initial.content);
  const [revision, setRevision] = useState(initial.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api("/exercises/memo", {
            method: "PUT",
            body: JSON.stringify({ name, content, expected_revision: revision }),
          });
          onSaved();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "保存できませんでした。");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        フォーム・意識すること
        <textarea
          maxLength={1000}
          rows={5}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={busy}
        />
      </label>
      <p className="muted">自分だけに保存 · {content.length}/1000</p>
      {error && (
        <p role="alert" className="error">
          {error}
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={async () => {
              if (
                content !== initial.content &&
                !window.confirm("未保存のメモを破棄して読み直しますか？")
              )
                return;
              setBusy(true);
              try {
                const latest = await api<ExerciseContext>(
                  `/exercises/context?name=${encodeURIComponent(name)}`,
                );
                setContent(latest.memo.content);
                setRevision(latest.memo.revision);
                setError("");
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "取得できませんでした。");
              } finally {
                setBusy(false);
              }
            }}
          >
            保存済みを読み直す
          </button>
        </p>
      )}
      <button type="submit" className="primary full" disabled={busy}>
        保存
      </button>
    </form>
  );
}
