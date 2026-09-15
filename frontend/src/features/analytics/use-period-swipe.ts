import { type PointerEvent, useRef } from "react";

export function usePeriodSwipe(onMove: (direction: number) => void) {
  const gesture = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const suppressUntil = useRef(0);
  return {
    style: { touchAction: "pan-y" as const },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (!event.isPrimary || event.button !== 0) return;
      gesture.current = { x: event.clientX, y: event.clientY, axis: null };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = gesture.current;
      if (!current) return;
      const dx = Math.abs(event.clientX - current.x);
      const dy = Math.abs(event.clientY - current.y);
      if (!current.axis && Math.max(dx, dy) > 10) current.axis = dx > dy * 1.5 ? "x" : "y";
      if (current.axis === "x") suppressUntil.current = Date.now() + 500;
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const current = gesture.current;
      gesture.current = null;
      if (current?.axis === "x" && Math.abs(event.clientX - current.x) >= 50)
        onMove(event.clientX > current.x ? -1 : 1);
    },
    onPointerCancel: () => {
      gesture.current = null;
    },
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
      if (Date.now() < suppressUntil.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
