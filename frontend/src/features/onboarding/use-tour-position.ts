import { type RefObject, useEffect, useState } from "react";

type Rect = { left: number; top: number; width: number; height: number };
type Position = {
  target: Rect | null;
  above: boolean;
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  suspended: boolean;
};
export function useTourPosition(
  open: boolean,
  target: string,
  card: RefObject<HTMLElement | null>,
  reposition: number,
) {
  const [position, setPosition] = useState<Position | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 同じ対象への再案内でもスクロール位置を取り直す。
  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    let frame = 0;
    let observed: HTMLElement | null = null;
    let scrolled = false;
    const resize = new ResizeObserver(schedule);
    if (card.current) resize.observe(card.current);
    resize.observe(document.body);
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    function measure() {
      frame = 0;
      const element =
        Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)).find(
          (node) => node.getClientRects().length > 0,
        ) ?? null;
      if (element !== observed) {
        if (observed) resize.unobserve(observed);
        observed = element;
        if (element) resize.observe(element);
      }
      if (element && !scrolled) {
        scrolled = true;
        element.scrollIntoView({ block: "center", behavior: "instant" });
      }
      const viewport = window.visualViewport;
      const height = viewport?.height ?? innerHeight;
      const offset = viewport?.offsetTop ?? 0;
      const width = Math.min(360, (viewport?.width ?? innerWidth) - 24);
      const box = element?.getBoundingClientRect();
      const visible = box && box.bottom > offset && box.top < offset + height;
      const rect = visible
        ? { left: box.x - 5, top: box.y - 5, width: box.width + 10, height: box.height + 10 }
        : null;
      const aboveSpace = rect ? rect.top - offset - 24 : 0;
      const belowSpace = rect ? height + offset - rect.top - rect.height - 24 : 0;
      const above = aboveSpace >= belowSpace;
      const maxHeight = rect ? Math.max(150, above ? aboveSpace : belowSpace) : height - 24;
      const cardHeight = Math.min(card.current?.getBoundingClientRect().height ?? 280, maxHeight);
      const top = rect
        ? above
          ? rect.top - cardHeight - 16
          : rect.top + rect.height + 16
        : offset + 12;
      const left = Math.max(
        12,
        Math.min(
          innerWidth - width - 12,
          rect ? rect.left + rect.width / 2 - width / 2 : (innerWidth - width) / 2,
        ),
      );
      const next = {
        target: rect,
        above,
        top: Math.max(offset + 12, Math.min(offset + height - cardHeight - 12, top)),
        left,
        width,
        maxHeight: Math.min(maxHeight, height - 24),
        suspended: !!document.querySelector("dialog[open]"),
      };
      setPosition((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    }
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "open"],
    });
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [open, target, card, reposition]);
  return position;
}
