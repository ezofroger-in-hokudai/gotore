"use client";

import { useEffect, useRef } from "react";

export function useStopwatchOrbit(startedAt: string | null | undefined, elapsed: string | null) {
  const orbit = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = orbit.current;
    const start = Date.parse(startedAt ?? "");
    if (!node || !elapsed || !Number.isFinite(start)) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animation = node.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: 60_000, iterations: Number.POSITIVE_INFINITY, easing: "linear" },
    );
    const align = () => {
      // 表示中のアニメーション時間ではなく、保存済み開始時刻へ復帰時も合わせる。
      animation.currentTime = Math.max(0, Date.now() - start) % 60_000;
      if (document.hidden || motion.matches) animation.pause();
      else animation.play();
    };
    align();
    document.addEventListener("visibilitychange", align);
    motion.addEventListener("change", align);
    return () => {
      animation.cancel();
      document.removeEventListener("visibilitychange", align);
      motion.removeEventListener("change", align);
    };
  }, [startedAt, elapsed]);
  return orbit;
}
