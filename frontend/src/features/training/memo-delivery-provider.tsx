"use client";
import { api } from "@/lib/api";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { useRecordSnapshot } from "../record-cache/record-snapshot-provider";
import { MemoDeliveryStore, type MemoTarget } from "./memo-delivery";
import type { Memo } from "./memo-draft";
import { MemoFeedback } from "./memo-feedback";

type Delivery = { store: MemoDeliveryStore; version: number; visible: Map<string, number> };
const Context = createContext<Delivery | null>(null);
export function MemoDeliveryProvider({
  userId,
  children,
}: { userId: string; children: ReactNode }) {
  const cache = useRecordSnapshot();
  const [version, render] = useState(0);
  const [visible] = useState(() => new Map<string, number>());
  const [store] = useState(
    () =>
      new MemoDeliveryStore(
        userId,
        {
          getItem: (key) => (typeof window === "undefined" ? null : localStorage.getItem(key)),
          setItem: (key, value) => localStorage.setItem(key, value),
          removeItem: (key) => localStorage.removeItem(key),
          keys: () => Object.keys(localStorage),
        },
        (target, memo, signal) =>
          api<Memo>(
            target.path,
            {
              method: "PUT",
              signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
              body: JSON.stringify({
                content: memo.content,
                expected_revision: memo.revision,
                ...(target.name ? { name: target.name } : {}),
              }),
            },
            userId,
          ),
        () => {
          void cache?.refresh();
        },
      ),
  );
  useEffect(() => {
    const unsubscribe = store.subscribe(() => render((value) => value + 1));
    store.start();
    const online = () => {
      for (const entry of store.pending())
        if (entry.phase !== "sending" && entry.errorStatus !== 409) store.retry(entry.target);
    };
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      store.stop();
      unsubscribe();
    };
  }, [store]);
  return <Context.Provider value={{ store, version, visible }}>{children}</Context.Provider>;
}
export function useMemoDelivery() {
  const value = useContext(Context);
  if (!value) throw new Error("メモの送信状態を利用できません。");
  return value;
}
export function useVisibleMemo(target: MemoTarget, active = true) {
  const { store, visible } = useMemoDelivery();
  const id = target.name ?? target.path;
  useEffect(() => {
    if (!active) return;
    visible.set(id, (visible.get(id) ?? 0) + 1);
    store.notify();
    return () => {
      visible.set(id, Math.max(0, (visible.get(id) ?? 1) - 1));
      store.notify();
    };
  }, [visible, id, store, active]);
  return store.read(target);
}
export function MemoDeliveryNotice() {
  const { store, visible } = useMemoDelivery();
  const entries = store
    .pending()
    .filter(
      (entry) =>
        (entry.phase === "error" || entry.storageError) &&
        !(visible.get(entry.target.name ?? entry.target.path) ?? 0),
    );
  if (!entries.length) return null;
  return (
    <section className="memo-delivery-notice" aria-label="メモの送信状態">
      {entries.map((entry) => (
        <div key={entry.target.name ?? entry.target.path}>
          <MemoFeedback
            entry={entry}
            label={entry.target.label}
            onRetry={() => store.retry(entry.target)}
          />
        </div>
      ))}
    </section>
  );
}
