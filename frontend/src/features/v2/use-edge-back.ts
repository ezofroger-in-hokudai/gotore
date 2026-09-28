import { useEffect } from "react";

export function useEdgeBack() {
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    const standalone = () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const onStart = (event: TouchEvent) => {
      start = null;
      if (!standalone() || event.touches.length !== 1 || window.history.state?.gotoreBack !== true)
        return;
      const touch = event.touches[0];
      if (touch.clientX <= 24) start = { x: touch.clientX, y: touch.clientY };
    };
    const onEnd = (event: TouchEvent) => {
      const current = start;
      start = null;
      const touch = event.changedTouches[0];
      if (
        current &&
        touch &&
        window.history.state?.gotoreBack === true &&
        touch.clientX - current.x >= 90 &&
        Math.abs(touch.clientY - current.y) <= 60
      )
        window.history.back();
    };
    const cancel = () => {
      start = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", cancel);
    window.addEventListener("popstate", cancel);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", cancel);
      window.removeEventListener("popstate", cancel);
    };
  }, []);
}
