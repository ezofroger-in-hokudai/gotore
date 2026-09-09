import type { GroupActivity } from "@/lib/api";
import { useEffect, useState } from "react";

export function memberIsLive(member: GroupActivity["members"][number], now: number) {
  return member.live && (!member.live_until || Date.parse(member.live_until) > now);
}

export function relativeTime(timestamp: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 60_000));
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}時間前`;
  return new Date(timestamp).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  });
}

export function useLiveClock(data: GroupActivity | null, active: boolean, trusted = true) {
  const [clock, setClock] = useState({
    now: Date.now(),
    online: true,
    visible: true,
  });
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const observed = data?.observed_at ? Date.parse(data.observed_at) : Date.now();
    let online = navigator.onLine;
    let wasHidden = document.hidden;
    let timer: number | undefined;
    const update = () =>
      setClock({
        now: Math.max(Date.now(), observed + performance.now() - start),
        online,
        visible: !document.hidden,
      });
    const visibility = () => {
      if (wasHidden && !document.hidden) online = false;
      wasHidden = document.hidden;
      window.clearInterval(timer);
      update();
      if (!document.hidden) timer = window.setInterval(update, 1000);
    };
    const offline = () => {
      online = false;
      update();
    };
    const connected = () => {
      // 復帰時は次の取得成功でLIVEを再表示する。
      online = false;
      update();
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("offline", offline);
    window.addEventListener("online", connected);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", connected);
    };
  }, [data, active]);
  return {
    now: clock.now,
    live: active && trusted && clock.online && clock.visible,
  };
}
