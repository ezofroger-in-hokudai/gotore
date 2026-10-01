"use client";

import { useEffect, useRef, useState } from "react";
import { describeElapsedTime } from "../session/elapsed-time";
import { useStopwatchOrbit } from "../session/use-stopwatch-orbit";

type Position = { side: "left" | "right"; top: number };
const EDGE_INSET = "max(16px, calc((100vw - 480px) / 2 + 16px))";

export function FloatingTraining({
  userId,
  resumable,
  disabled,
  elapsed,
  startedAt,
  recording = false,
  onActivate,
}: {
  userId: string;
  resumable: boolean;
  disabled: boolean;
  elapsed: string | null;
  startedAt?: string | null;
  recording?: boolean;
  onActivate: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
    dragging: boolean;
  } | null>(null);
  const moved = useRef(false);
  const orbit = useStopwatchOrbit(startedAt, elapsed);
  const [bounds, setBounds] = useState<{
    minTop: number;
    maxTop: number;
    defaultTop: number;
  } | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const storageKey = `gotore:floating-training-position:${userId}`;

  useEffect(() => {
    const fit = (value: Position) => {
      const rect = button.current?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const minTop = (viewport?.offsetTop ?? 0) + 56;
      const maxTop = Math.max(
        minTop,
        (viewport?.offsetTop ?? 0) +
          (viewport?.height ?? window.innerHeight) -
          (rect?.height ?? 80) -
          82,
      );
      return { ...value, top: Math.max(minTop, Math.min(maxTop, value.top)) };
    };
    setPosition(null);
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      if ((saved?.side === "left" || saved?.side === "right") && Number.isFinite(saved.top))
        setPosition(fit(saved));
    } catch {}
    const resize = () => setPosition((current) => (current ? fit(current) : null));
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
    };
  }, [storageKey]);

  useEffect(() => {
    const main = button.current?.closest(".v2-app")?.querySelector(".main-content");
    let dock: Element | null = null;
    const measure = () => {
      const viewport = window.visualViewport;
      const offset = viewport?.offsetTop ?? 0;
      const height = viewport?.height ?? window.innerHeight;
      const minTop = offset + 56;
      const dockTop =
        recording && dock ? dock.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
      const maxTop = Math.max(minTop, Math.min(offset + height - 162, dockTop - 94));
      setBounds({
        minTop,
        maxTop,
        defaultTop: Math.max(minTop, Math.min(maxTop, offset + height - 406)),
      });
    };
    const observer = new ResizeObserver(measure);
    const attachDock = () => {
      const next = recording
        ? document.querySelector(".recording-view .recording-entry-dock")
        : null;
      if (next === dock) return;
      if (dock) observer.unobserve(dock);
      dock = next;
      if (dock) observer.observe(dock);
    };
    const mutation = new MutationObserver(() => {
      attachDock();
      measure();
    });
    if (main) {
      observer.observe(main);
      mutation.observe(main, { childList: true, subtree: true });
    }
    attachDock();
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [recording]);

  function limits(width: number, height: number) {
    const shell = button.current?.closest(".v2-app")?.getBoundingClientRect();
    const left = (shell?.left ?? 0) + 16;
    const right = (shell?.right ?? window.innerWidth) - width - 16;
    const viewport = window.visualViewport;
    const minTop = (viewport?.offsetTop ?? 0) + 56;
    const dock = recording
      ? document.querySelector(".recording-view .recording-entry-dock")?.getBoundingClientRect()
      : null;
    const maxTop = Math.max(
      minTop,
      Math.min(
        (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - height - 82,
        dock ? dock.top - height - 14 : Number.POSITIVE_INFINITY,
      ),
    );
    return { left, right, minTop, maxTop };
  }

  function finish(pointerId: number) {
    const current = gesture.current;
    if (!current || current.pointerId !== pointerId) return;
    if (current.dragging && button.current) {
      const rect = button.current.getBoundingClientRect();
      const bounds = limits(rect.width, rect.height);
      const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
      const next = {
        side,
        top: Math.max(bounds.minTop, Math.min(bounds.maxTop, rect.top)),
      } satisfies Position;
      button.current.style.left = side === "left" ? EDGE_INSET : "";
      button.current.style.right = side === "right" ? EDGE_INSET : "";
      setPosition(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      moved.current = true;
    }
    if (button.current?.hasPointerCapture(pointerId))
      button.current.releasePointerCapture(pointerId);
    gesture.current = null;
  }

  const style =
    position || bounds
      ? {
          left: position?.side === "left" ? EDGE_INSET : undefined,
          right: position?.side === "left" ? undefined : EDGE_INSET,
          top: position
            ? Math.max(
                bounds?.minTop ?? 56,
                Math.min(bounds?.maxTop ?? Number.POSITIVE_INFINITY, position.top),
              )
            : bounds?.defaultTop,
          bottom: "auto",
        }
      : undefined;

  return (
    <button
      ref={button}
      type="button"
      className="floating-training"
      data-testid="floating-training"
      data-tour="start"
      data-mode={recording ? "finish" : resumable ? "record" : "start"}
      aria-label={
        recording ? "トレーニング終了" : resumable ? "記録画面へ戻る" : "トレーニングを開始"
      }
      aria-describedby={resumable && elapsed ? "floating-training-elapsed" : undefined}
      disabled={disabled}
      style={style}
      onPointerDown={(event) => {
        if (disabled || !button.current || !event.isPrimary || event.button !== 0) return;
        moved.current = false;
        const rect = button.current.getBoundingClientRect();
        const current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: rect.left,
          top: rect.top,
          dragging: false,
        };
        button.current.setPointerCapture(event.pointerId);
        gesture.current = current;
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId || !button.current) return;
        if (!current.dragging) {
          if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 8) return;
          current.dragging = true;
          button.current.classList.add("is-dragging");
        }
        const rect = button.current.getBoundingClientRect();
        const bounds = limits(rect.width, rect.height);
        const left = Math.max(
          bounds.left,
          Math.min(bounds.right, current.left + event.clientX - current.x),
        );
        const top = Math.max(
          bounds.minTop,
          Math.min(bounds.maxTop, current.top + event.clientY - current.y),
        );
        button.current.style.left = `${left}px`;
        button.current.style.right = "auto";
        button.current.style.top = `${top}px`;
        button.current.style.bottom = "auto";
      }}
      onPointerUp={(event) => {
        button.current?.classList.remove("is-dragging");
        finish(event.pointerId);
      }}
      onPointerCancel={(event) => {
        button.current?.classList.remove("is-dragging");
        finish(event.pointerId);
      }}
      onClick={(event) => {
        if (moved.current && event.detail !== 0) {
          event.preventDefault();
          moved.current = false;
          return;
        }
        onActivate();
      }}
    >
      <span className="floating-training-crown" aria-hidden="true" />
      <span className="floating-training-dial" aria-hidden="true">
        <span className="floating-training-elapsed">{resumable ? (elapsed ?? "…") : "START"}</span>
        <span ref={orbit} className="floating-training-orbit" hidden={!elapsed} aria-hidden="true">
          <i />
        </span>
        <span className="floating-training-action">
          {recording ? "■ 終了" : resumable ? "記録へ" : ""}
        </span>
      </span>
      {resumable && elapsed && (
        <span className="sr-only" id="floating-training-elapsed">
          経過時間 {describeElapsedTime(elapsed)}
        </span>
      )}
    </button>
  );
}
