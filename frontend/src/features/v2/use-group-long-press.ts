import { type MouseEvent, type PointerEvent, useCallback, useEffect, useRef } from "react";

export function useGroupLongPress(onLongPress: (() => void) | undefined, active = true) {
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const suppressed = useRef(false);
  const cancel = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }, []);
  useEffect(() => {
    if (!active) cancel();
    return cancel;
  }, [active, cancel]);
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      cancel();
      suppressed.current = false;
      if (!onLongPress || !active || !event.isPrimary || event.button !== 0) return;
      press.current = {
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
          suppressed.current = true;
          cancel();
          onLongPress();
        }, 450),
      };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (
        press.current &&
        Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 10
      )
        cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (onLongPress) event.preventDefault();
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (suppressed.current && event.detail > 0) {
        suppressed.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
