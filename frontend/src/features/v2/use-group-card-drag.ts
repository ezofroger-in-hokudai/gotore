import type { Group } from "@/lib/api";
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { moveGroup } from "./group-order";

type Gesture = {
  id: string;
  pointer: number;
  startX: number;
  startY: number;
  x: number;
  scroll: number;
  initial: number;
  pitch: number;
  maxScroll: number;
  from: number;
  target: number;
  mode: "pending" | "swipe" | "drag";
};
type Drag = { id: string; from: number; target: number; dx: number; pitch: number };

export function useGroupCardDrag({
  carousel,
  groups,
  selected,
  active,
  onSave,
  onOpen,
  onSelect,
}: {
  carousel: RefObject<HTMLDivElement | null>;
  groups: Group[];
  selected: string;
  active: boolean;
  onSave: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const latest = useRef({ groups, selected, active, onSave, onOpen });
  latest.current = { groups, selected, active, onSave, onOpen };
  const gesture = useRef<Gesture | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef(0);
  const destination = useRef<number | null>(null);
  const settling = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [error, setError] = useState("");
  const stop = useCallback(
    (restoreSnap = true) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      cancelAnimationFrame(frame.current);
      destination.current = null;
      const current = gesture.current;
      gesture.current = null;
      const element = carousel.current;
      if (element) {
        if (restoreSnap) element.style.scrollSnapType = "";
        if (current && element.hasPointerCapture(current.pointer))
          element.releasePointerCapture(current.pointer);
      }
      setDrag(null);
      return current;
    },
    [carousel],
  );
  const restore = useCallback(() => {
    const element = carousel.current;
    if (!element) return;
    const index = latest.current.groups.findIndex((group) => group.id === latest.current.selected);
    const card = element.children[Math.max(0, index)] as HTMLElement | undefined;
    settling.current = true;
    if (card) element.scrollLeft = card.offsetLeft;
    requestAnimationFrame(() => {
      settling.current = false;
    });
  }, [carousel]);
  const cancel = useCallback(() => {
    const wasAnimating = destination.current !== null;
    const current = stop();
    if (current || wasAnimating) restore();
  }, [stop, restore]);
  const ids = groups.map((group) => group.id).join(",");
  useEffect(() => {
    if (!active || !ids) cancel();
    return cancel;
  }, [active, ids, cancel]);

  function animateTo(index: number) {
    const element = carousel.current;
    if (!element) return;
    stop(false);
    const target = Math.max(0, Math.min(groups.length - 1, index));
    const card = element.children[target] as HTMLElement;
    const left = Math.min(card.offsetLeft, element.scrollWidth - element.clientWidth);
    const start = element.scrollLeft;
    const startedAt = performance.now();
    destination.current = target;
    element.style.scrollSnapType = "none";
    // 目標へ到着するまで吸着を戻さず、次の操作ではこの目標を引き継ぐ。
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160;
    const advance = (now: number) => {
      const progress = duration ? Math.min(1, (now - startedAt) / duration) : 1;
      element.scrollLeft = start + (left - start) * (1 - (1 - progress) ** 3);
      if (progress < 1) {
        frame.current = requestAnimationFrame(advance);
      } else {
        destination.current = null;
        element.style.scrollSnapType = "";
      }
    };
    advance(startedAt);
  }

  function updateDrag() {
    const current = gesture.current;
    const element = carousel.current;
    if (!current || current.mode !== "drag" || !element) return;
    const dx = Math.max(
      -current.from * current.pitch,
      Math.min(
        (groups.length - 1 - current.from) * current.pitch,
        current.x - current.startX + element.scrollLeft - current.scroll,
      ),
    );
    current.target = Math.max(
      0,
      Math.min(groups.length - 1, Math.round(current.from + dx / current.pitch)),
    );
    const next = {
      id: current.id,
      from: current.from,
      target: current.target,
      dx,
      pitch: current.pitch,
    };
    setDrag((previous) =>
      previous?.id === next.id && previous.dx === next.dx && previous.target === next.target
        ? previous
        : next,
    );
  }
  function autoScroll() {
    const current = gesture.current;
    const element = carousel.current;
    if (!current || current.mode !== "drag" || !element) return;
    const rect = element.getBoundingClientRect();
    const edge = 48;
    const speed = current.x < rect.left + edge ? -12 : current.x > rect.right - edge ? 12 : 0;
    if (speed)
      element.scrollLeft = Math.max(0, Math.min(current.maxScroll, element.scrollLeft + speed));
    updateDrag();
    frame.current = requestAnimationFrame(autoScroll);
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    const element = carousel.current;
    if (current.mode === "drag") {
      updateDrag();
      try {
        if (current.from !== current.target)
          onSave(
            moveGroup(
              groups.map((group) => group.id),
              current.id,
              current.target,
            ),
          );
        setError("");
      } catch {
        setError("表示順を保存できませんでした。もう一度長押ししてお試しください。");
      }
      stop();
      restore();
    } else if (current.mode === "swipe" && element) {
      const distance = current.x - current.startX;
      const initial = current.initial;
      const step = Math.abs(distance) > 40 ? (distance < 0 ? 1 : -1) : 0;
      const index = Math.max(0, Math.min(groups.length - 1, initial + step));
      // 選択は離した時に一度だけ確定し、描画途中のスクロール位置には従わない。
      onSelect(groups[index].id);
      animateTo(index);
    } else {
      stop();
      onOpen(current.id);
    }
  }
  function style(id: string, index: number): CSSProperties | undefined {
    if (!drag) return undefined;
    let dx = 0;
    if (id === drag.id) dx = drag.dx;
    else if (index > drag.from && index <= drag.target) dx = -drag.pitch;
    else if (index < drag.from && index >= drag.target) dx = drag.pitch;
    return {
      transform: `translateX(${dx}px)${id === drag.id ? " scale(0.97)" : ""}`,
      transition: id === drag.id ? "none" : "transform 120ms ease",
    };
  }
  return {
    drag,
    error,
    style,
    cancel,
    isMoving: () => settling.current || gesture.current !== null || destination.current !== null,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (!active || event.button !== 0) return;
        if (!event.isPrimary) {
          cancel();
          return;
        }
        const card = (event.target as HTMLElement).closest<HTMLElement>("[data-group-id]");
        const id = card?.dataset.groupId;
        if (!card || !id) return;
        const element = event.currentTarget;
        const pitch = card.offsetWidth + 12;
        const initial = destination.current ?? Math.round(element.scrollLeft / pitch);
        stop(false);
        element.style.scrollSnapType = "none";
        element.setPointerCapture(event.pointerId);
        gesture.current = {
          id,
          pointer: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          x: event.clientX,
          scroll: element.scrollLeft,
          initial,
          pitch,
          maxScroll: element.scrollWidth - element.clientWidth,
          from: groups.findIndex((group) => group.id === id),
          target: 0,
          mode: "pending",
        };
        if (groups.length > 1)
          timer.current = setTimeout(() => {
            const current = gesture.current;
            if (!current || current.mode !== "pending") return;
            current.mode = "drag";
            current.target = current.from;
            setError("");
            autoScroll();
          }, 450);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const current = gesture.current;
        if (!current || current.pointer !== event.pointerId) return;
        current.x = event.clientX;
        const dx = event.clientX - current.startX;
        const dy = event.clientY - current.startY;
        if (current.mode === "pending" && Math.hypot(dx, dy) > 10) {
          if (timer.current) clearTimeout(timer.current);
          if (Math.abs(dy) > Math.abs(dx)) {
            cancel();
            return;
          }
          current.mode = "swipe";
        }
        if (current.mode === "swipe") {
          const left = (current.initial - 1) * current.pitch;
          const right = (current.initial + 1) * current.pitch;
          event.currentTarget.scrollLeft = Math.max(left, Math.min(right, current.scroll - dx));
        }
        if (current.mode === "drag") updateDrag();
      },
      onPointerUp: finish,
      onPointerCancel: cancel,
      onLostPointerCapture: () => {
        if (gesture.current) cancel();
      },
      onContextMenu: (event: MouseEvent<HTMLDivElement>) => event.preventDefault(),
      onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
        // ポインターの詳細遷移は離した時だけ実行し、キーボードのクリックはカードに任せる。
        if (event.detail > 0) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape" && (gesture.current || destination.current !== null)) {
          event.preventDefault();
          cancel();
        }
      },
    },
  };
}
