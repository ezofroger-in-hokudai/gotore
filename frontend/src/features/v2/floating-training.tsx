"use client";

import { useEffect, useRef, useState } from "react";

type Position = { side: "left" | "right"; top: number };

export function FloatingTraining({
  userId,
  resumable,
  disabled,
  onActivate,
}: {
  userId: string;
  resumable: boolean;
  disabled: boolean;
  onActivate: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
    timer: number;
    dragging: boolean;
  } | null>(null);
  const moved = useRef(false);
  const [position, setPosition] = useState<Position | null>(null);
  const storageKey = `gotore:floating-training-position:${userId}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      if ((saved?.side === "left" || saved?.side === "right") && Number.isFinite(saved.top))
        setPosition(saved);
    } catch {}
  }, [storageKey]);

  function limits(width: number, height: number) {
    const shell = button.current?.closest(".v2-app")?.getBoundingClientRect();
    const left = (shell?.left ?? 0) + 16;
    const right = (shell?.right ?? window.innerWidth) - width - 16;
    return { left, right, minTop: 56, maxTop: window.innerHeight - height - 82 };
  }

  function finish(pointerId: number) {
    const current = gesture.current;
    if (!current || current.pointerId !== pointerId) return;
    window.clearTimeout(current.timer);
    if (current.dragging && button.current) {
      const rect = button.current.getBoundingClientRect();
      const bounds = limits(rect.width, rect.height);
      const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
      const next = {
        side,
        top: Math.max(bounds.minTop, Math.min(bounds.maxTop, rect.top)),
      } satisfies Position;
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

  const style = position
    ? {
        left: position.side === "left" ? "max(16px, calc((100vw - 480px) / 2 + 16px))" : undefined,
        right:
          position.side === "right" ? "max(16px, calc((100vw - 480px) / 2 + 16px))" : undefined,
        top: position.top,
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
      aria-label={resumable ? "トレーニングを再開" : "トレーニングを開始"}
      disabled={disabled}
      style={style}
      onPointerDown={(event) => {
        if (disabled || !button.current) return;
        moved.current = false;
        const rect = button.current.getBoundingClientRect();
        const current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: rect.left,
          top: rect.top,
          timer: 0,
          dragging: false,
        };
        current.timer = window.setTimeout(() => {
          current.dragging = true;
          button.current?.setPointerCapture(event.pointerId);
          button.current?.classList.add("is-dragging");
        }, 280);
        gesture.current = current;
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (
          !current ||
          current.pointerId !== event.pointerId ||
          !current.dragging ||
          !button.current
        )
          return;
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
        if (moved.current) {
          event.preventDefault();
          moved.current = false;
          return;
        }
        onActivate();
      }}
    >
      {resumable ? "RESUME" : "START"}
    </button>
  );
}
