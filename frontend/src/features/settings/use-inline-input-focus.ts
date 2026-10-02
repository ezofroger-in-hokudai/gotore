import { type RefObject, useEffect } from "react";

export function useInlineInputFocus(inputRef: RefObject<HTMLInputElement | null>, enabled = true) {
  useEffect(() => {
    const input = inputRef.current;
    if (!enabled || !input) return;

    input.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const ensureVisible = () => {
      const rect = input.getBoundingClientRect();
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      if (rect.top < top + 12 || rect.bottom > bottom - 12) {
        input.scrollIntoView({ block: "nearest" });
      }
    };
    const frame = requestAnimationFrame(ensureVisible);
    viewport?.addEventListener("resize", ensureVisible, { once: true });
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", ensureVisible);
    };
  }, [enabled, inputRef]);
}
