"use client";

import { api } from "@/lib/api";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createSessionId } from "../session/session-id";
import { type StampJob, StampStore, stampKey } from "./stamp-store";

function createClient(userId: string) {
  const prefix = `egotore:stamp-job:v1:${userId}:`;
  const store = new StampStore({
    request: api,
    read: () =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith(prefix))
        .map((key) => {
          try {
            return JSON.parse(localStorage.getItem(key) ?? "null");
          } catch {
            return null;
          }
        }),
    write: (job: StampJob) => localStorage.setItem(prefix + job.id, JSON.stringify(job)),
    remove: (job: StampJob) => localStorage.removeItem(prefix + job.id),
    // LAN上のHTTP実機ではrandomUUIDが公開されないため、セッションと同じ互換IDを使う。
    id: createSessionId,
    lock: (key, work) => (navigator.locks ? navigator.locks.request(prefix + key, work) : work()),
  });
  const records = new Map<string, Map<string, number>>();
  const inflight = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function refresh() {
    if (document.visibilityState === "hidden") return;
    await Promise.all(
      [...records].map(async ([group, ids]) => {
        if (inflight.has(group)) return;
        inflight.add(group);
        try {
          await store.refresh(group, [...ids.keys()]);
        } finally {
          inflight.delete(group);
        }
      }),
    );
  }
  return {
    store,
    refresh,
    register(group: string, workout: string) {
      const ids = records.get(group) ?? new Map<string, number>();
      ids.set(workout, (ids.get(workout) ?? 0) + 1);
      records.set(group, ids);
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 0);
      return () => {
        const count = ids.get(workout) ?? 0;
        if (count > 1) ids.set(workout, count - 1);
        else ids.delete(workout);
        if (!ids.size) records.delete(group);
        store.prune(
          new Set(
            [...records].flatMap(([g, workouts]) =>
              [...workouts.keys()].map((w) => stampKey(g, w)),
            ),
          ),
        );
      };
    },
    stop() {
      clearTimeout(timer);
      store.stop();
    },
  };
}
const Context = createContext<ReturnType<typeof createClient> | null>(null);
export function StampProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [client] = useState(() => createClient(userId));
  useEffect(() => {
    client.store.start();
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      void client.refresh();
      client.store.sync();
    };
    resume();
    const interval = setInterval(resume, 10000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      client.stop();
    };
  }, [client]);
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
export function useStamps(group?: string, workout?: string, active = true) {
  const client = useContext(Context);
  if (!client) throw new Error("StampProvider is required");
  useSyncExternalStore(client.store.subscribe, client.store.snapshot, client.store.snapshot);
  useEffect(() => {
    if (active && group && workout) return client.register(group, workout);
  }, [client, group, workout, active]);
  return client.store;
}
