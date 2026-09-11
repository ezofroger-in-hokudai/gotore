import type { GroupActivity, Workout } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { resourceRequest } from "../training/resource-request";
import { memberIsLive } from "./live-presence";

type Entry = {
  version: string;
  data: Workout | null;
  error: string;
  savedAt: number;
  controller?: AbortController;
};

export function useSharedWorkoutDetails(
  activity: GroupActivity,
  active: boolean,
  opened: string | null,
) {
  const root = useRef<HTMLDivElement>(null);
  const entries = useRef(new Map<string, Entry>());
  const recheck = useRef(new Set<string>());
  const [visible, setVisible] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const latest = useRef({ activity, opened });
  latest.current = { activity, opened };
  const notify = useCallback(() => setTick((value) => value + 1), []);
  const stop = useCallback(() => {
    for (const entry of entries.current.values()) {
      entry.controller?.abort();
      entry.controller = undefined;
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: フィード更新で追加された要素も監視する。
  useEffect(() => {
    if (!active || !root.current) return;
    const ids = new Set<string>();
    const observer = new IntersectionObserver(
      (changes) => {
        for (const change of changes) {
          const id = (change.target as HTMLElement).dataset.workoutId;
          if (!id) continue;
          if (change.isIntersecting) ids.add(id);
          else ids.delete(id);
        }
        setVisible(Array.from(ids));
      },
      { rootMargin: "120px" },
    );
    for (const element of root.current.querySelectorAll("[data-workout-id]"))
      observer.observe(element);
    return () => observer.disconnect();
  }, [active, activity.feed]);

  useEffect(() => {
    if (opened && !entries.current.get(opened)?.controller) recheck.current.add(opened);
    notify();
  }, [opened, notify]);

  useEffect(() => {
    if (!active) {
      stop();
      return;
    }
    const visibility = () => {
      if (document.hidden) stop();
      else if (latest.current.opened) recheck.current.add(latest.current.opened);
      notify();
    };
    const timer = window.setInterval(() => {
      const { activity: current, opened: id } = latest.current;
      const item = current.feed.find((item) => item.workout_id === id);
      const member = current.members.find((member) => member.id === item?.user_id);
      // 最新フィードから外れた記録の共有可否は、詳細APIで確認し続ける。
      if (id && (!item || (member && memberIsLive(member, Date.now())))) recheck.current.add(id);
      notify();
    }, 5000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [active, notify, stop]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 通信完了・再試行・周期更新で待機中の先読みを進める。
  useEffect(() => {
    if (!active || document.hidden) return;
    const feed = new Map(activity.feed.map((item) => [item.workout_id, item]));
    const live = new Set(
      activity.members
        .filter((member) => memberIsLive(member, Date.now()))
        .map((member) => member.id),
    );
    const ids = [
      ...new Set([...(opened ? [opened] : []), ...visible.filter((id) => feed.has(id))]),
    ].sort(
      (a, b) =>
        Number(b === opened) - Number(a === opened) ||
        Number(live.has(feed.get(b)?.user_id || "")) - Number(live.has(feed.get(a)?.user_id || "")),
    );
    for (const [id, entry] of entries.current) {
      if ((!feed.has(id) && id !== opened) || entry.version !== (feed.get(id)?.updated_at || "")) {
        entry.controller?.abort();
        entries.current.delete(id);
      }
    }
    if (
      opened &&
      !entries.current.get(opened)?.controller &&
      (recheck.current.has(opened) || !entries.current.get(opened)?.data)
    ) {
      const pending = [...entries.current].filter(([, entry]) => entry.controller);
      if (pending.length >= 2) {
        // タップした詳細は、未完了の先読みより先に取得する。
        const background = pending.findLast(([id]) => id !== opened)?.[1];
        background?.controller?.abort();
        if (background) background.controller = undefined;
      }
    }
    for (const id of ids.slice(0, 20)) {
      const version = feed.get(id)?.updated_at || "";
      const previous = entries.current.get(id);
      if (previous?.controller && previous.version === version) continue;
      if (
        previous &&
        previous.version === version &&
        !recheck.current.has(id) &&
        ((previous.data && Date.now() - previous.savedAt < 60000) ||
          (previous.error && Date.now() - previous.savedAt < 5000))
      )
        continue;
      if (!entries.current.has(id) && entries.current.size >= 20) {
        const oldest = [...entries.current].find(([key]) => !ids.slice(0, 20).includes(key));
        if (!oldest) continue;
        oldest[1].controller?.abort();
        entries.current.delete(oldest[0]);
      }
      if ([...entries.current.values()].filter((entry) => entry.controller).length >= 2) break;
      previous?.controller?.abort();
      const controller = new AbortController();
      const entry: Entry = {
        version,
        data:
          previous?.version === version && Date.now() - previous.savedAt < 60000
            ? previous.data
            : null,
        error: "",
        savedAt: previous?.savedAt || 0,
        controller,
      };
      entries.current.delete(id);
      entries.current.set(id, entry);
      recheck.current.delete(id);
      void resourceRequest<Workout>(
        `/groups/${activity.group_id}/workouts/${id}`,
        controller.signal,
      )
        .then((data) => {
          if (!controller.signal.aborted && entries.current.get(id) === entry) {
            entry.data = data;
            entry.savedAt = Date.now();
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted && entries.current.get(id) === entry) {
            entry.data = null;
            entry.error = reason instanceof Error ? reason.message : "取得できませんでした。";
            entry.savedAt = Date.now();
          }
        })
        .finally(() => {
          if (!controller.signal.aborted && entries.current.get(id) === entry) {
            entry.controller = undefined;
            notify();
          }
        });
    }
  }, [activity, active, opened, visible, tick, notify]);

  const current = opened ? entries.current.get(opened) : undefined;
  return {
    root,
    data:
      current?.version ===
        (activity.feed.find((item) => item.workout_id === opened)?.updated_at || "") &&
      Date.now() - current.savedAt < 60000
        ? current?.data || null
        : null,
    error: current?.error || "",
    retry: () => {
      if (opened) recheck.current.add(opened);
      notify();
    },
  };
}
