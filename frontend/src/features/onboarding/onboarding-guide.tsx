import { useEffect, useRef, useState } from "react";
import { type TourView, tourSteps } from "./tour-steps";
import { useTourPosition } from "./use-tour-position";

export function OnboardingGuide({
  userId,
  replay,
  onVisit,
}: { userId: string; replay: number; onVisit: (view: TourView, target: string) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [visitVersion, setVisitVersion] = useState(0);
  const [storageWarning, setStorageWarning] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const card = useRef<HTMLElement>(null);
  const visit = useRef(onVisit);
  visit.current = onVisit;
  const storageKey = `gotore:onboarding:v2:${userId}`;
  const current = tourSteps[step];
  const position = useTourPosition(open, current.target, card, replay + visitVersion);

  useEffect(() => {
    if (replay > 0) {
      setStep(0);
      setOpen(true);
      return;
    }
    try {
      setOpen(localStorage.getItem(storageKey) !== "seen");
    } catch {
      setStorageWarning(true);
      setOpen(true);
    }
  }, [storageKey, replay]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 再表示・段階変更でのみ案内先へ移動し、通常操作の画面変更は妨げない。
  useEffect(() => {
    if (!open) return;
    visit.current(tourSteps[step].view, tourSteps[step].target);
    heading.current?.focus({ preventScroll: true });
  }, [open, step, replay]);

  function close() {
    try {
      localStorage.setItem(storageKey, "seen");
    } catch {
      setStorageWarning(true);
    }
    setOpen(false);
    const target = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
    if (target?.getClientRects().length) {
      const focusable = target.matches("button, input")
        ? target
        : target.querySelector<HTMLElement>("button, input");
      focusable?.focus({ preventScroll: true });
    }
  }
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) closeRef.current();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open]);

  if (!open)
    return storageWarning ? (
      <p className="muted">次回もガイドが表示される場合があります。</p>
    ) : null;
  return (
    <div className="tour-layer" hidden={position?.suspended}>
      {position?.target && (
        <div className="tour-highlight" aria-hidden="true" style={position.target} />
      )}
      <section
        ref={card}
        className="panel onboarding-guide guided-tour"
        aria-label="使い方ガイド"
        style={
          position
            ? {
                top: position.top,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }
            : undefined
        }
      >
        <div className="onboarding-header">
          <p className="eyebrow">
            使い方 · {step + 1} / {tourSteps.length}
          </p>
          <button className="text-button" type="button" onClick={close}>
            スキップ
          </button>
        </div>
        <h2 ref={heading} tabIndex={-1}>
          {current.title}
        </h2>
        <p>{current.description}</p>
        <p className="onboarding-hint">{current.hint}</p>
        {!position?.target && (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setVisitVersion((version) => version + 1);
              visit.current(current.view, current.target);
            }}
          >
            案内の画面に戻る
          </button>
        )}
        <details key={step}>
          <summary>操作のヒント</summary>
          <ul>
            {current.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </details>
        {storageWarning && <p className="muted">次回もガイドが表示される場合があります。</p>}
        <div className="onboarding-actions">
          <button
            className="secondary"
            type="button"
            disabled={step === 0}
            onClick={() => setStep((value) => value - 1)}
          >
            戻る
          </button>
          {step < tourSteps.length - 1 ? (
            <button className="primary" type="button" onClick={() => setStep((value) => value + 1)}>
              次へ
            </button>
          ) : (
            <button className="primary" type="button" onClick={close}>
              はじめる
            </button>
          )}
        </div>
      </section>
      {position?.target && (
        <svg
          className="tour-arrow"
          aria-hidden="true"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          style={{
            left: position.target.left + position.target.width / 2 - 12,
            top: position.above
              ? position.target.top - 22
              : position.target.top + position.target.height - 2,
            transform: position.above ? undefined : "rotate(180deg)",
          }}
        >
          <path d="M12 2v17m-6-6 6 6 6-6" />
        </svg>
      )}
    </div>
  );
}
