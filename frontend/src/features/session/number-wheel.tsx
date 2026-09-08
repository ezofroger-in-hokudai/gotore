import { useEffect, useRef, useState } from "react";

export function NumberWheel({
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
  const [offset, setOffset] = useState(0);
  const current = useRef(Number(value) || 0);
  const callback = useRef(onChange);
  callback.current = onChange;
  current.current = Number(value) || 0;
  const frame = useRef(0);
  const gesture = useRef<{
    y: number;
    start: number;
    lastY: number;
    time: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const clamp = (n: number) => Math.round(Math.min(1000, Math.max(min, n)) * 10) / 10;
  const change = (n: number) => {
    const next = clamp(n);
    if (next !== current.current) {
      current.current = next;
      callback.current(String(next));
    }
  };
  const shift = (delta: number) => change(current.current + delta);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return (
    <div
      ref={host}
      className="number-wheel"
      onPointerDown={(event) => {
        if (event.target instanceof HTMLButtonElement) return;
        cancelAnimationFrame(frame.current);
        gesture.current = {
          y: event.clientY,
          start: current.current,
          lastY: event.clientY,
          time: performance.now(),
          velocity: 0,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const active = gesture.current;
        if (!active) return;
        const y = event.clientY;
        const now = performance.now();
        active.velocity = (active.lastY - y) / Math.max(1, now - active.time);
        active.lastY = y;
        active.time = now;
        if (Math.abs(active.y - y) > 4) active.moved = true;
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          const distance = active.y - y;
          const steps = Math.round(distance / 18);
          change(active.start + steps * step);
          setOffset(Math.max(-9, Math.min(9, steps * 18 - distance)));
        });
      }}
      onPointerUp={(event) => {
        const active = gesture.current;
        if (!active) return;
        gesture.current = null;
        cancelAnimationFrame(frame.current);
        const distance = active.y - event.clientY;
        change(active.start + Math.round(distance / 18) * step);
        setOffset(0);
        if (!active.moved) {
          field.current?.focus();
          field.current?.select();
          return;
        }
        // 短い慣性だけを加え、次のタップ・ドラッグで即座に停止できるようにする。
        let velocity =
          performance.now() - active.time < 80 ? Math.max(-1.5, Math.min(1.5, active.velocity)) : 0;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) velocity = 0;
        let remaining = 0;
        let time = performance.now();
        const coast = (now: number) => {
          const elapsed = Math.min(32, now - time);
          time = now;
          remaining += velocity * elapsed;
          velocity *= Math.exp(-elapsed / 65);
          const steps = Math.trunc(remaining / 18);
          if (steps) {
            shift(steps * step);
            remaining -= steps * 18;
          }
          if (Math.abs(velocity) > 0.04) frame.current = requestAnimationFrame(coast);
        };
        if (Math.abs(velocity) > 0.04) frame.current = requestAnimationFrame(coast);
      }}
      onPointerCancel={() => {
        gesture.current = null;
        cancelAnimationFrame(frame.current);
        setOffset(0);
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
        disabled={Number(value) <= min}
        onClick={() => {
          cancelAnimationFrame(frame.current);
          shift(-step);
        }}
      >
        {clamp(Number(value) - step)}
      </button>
      <input
        ref={field}
        id={`set-${unit}`}
        aria-label={label}
        type="number"
        inputMode={unit === "kg" ? "decimal" : "numeric"}
        min={min}
        max={1000}
        step={unit === "kg" ? 0.1 : 1}
        required
        value={value}
        style={{ transform: `translateY(${offset}px)` }}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={() => cancelAnimationFrame(frame.current)}
      />
      <button
        type="button"
        className="wheel-neighbor"
        aria-label={`${label}を増やす`}
        disabled={Number(value) >= 1000}
        onClick={() => {
          cancelAnimationFrame(frame.current);
          shift(step);
        }}
      >
        {clamp(Number(value) + step)}
      </button>
    </div>
  );
}
