"use client";

import { useEffect, useState } from "react";

export function formatElapsedTime(startedAt: string, now: number): string | null {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(now)) return null;
  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, "0")}`;
}

export function describeElapsedTime(elapsed: string): string {
  const [hours, minutes] = elapsed.split(":").map(Number);
  return hours ? `${hours}時間${minutes}分` : `${minutes}分`;
}

export function useElapsedTime(startedAt: string | null | undefined, active: boolean) {
  const [clock, setClock] = useState<{ startedAt: string; now: number } | null>(null);

  useEffect(() => {
    if (!active || !startedAt || !Number.isFinite(Date.parse(startedAt))) return;
    const start = Date.parse(startedAt);
    let timer: number | undefined;
    const update = () => {
      if (document.hidden) return;
      const now = Date.now();
      setClock({ startedAt, now });
      const elapsed = Math.max(0, now - start);
      timer = window.setTimeout(update, Math.max(1000, 60_000 - (elapsed % 60_000)));
    };
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) update();
    };
    update();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [startedAt, active]);

  return active && startedAt && clock?.startedAt === startedAt
    ? formatElapsedTime(startedAt, clock.now)
    : null;
}
