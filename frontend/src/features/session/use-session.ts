import { type Exercise, type TrainingSession, api } from "@/lib/api";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SessionQueue } from "./session-queue";

export function useSession(userId: string, onChanged: () => void) {
  const storageKey = `gotore:session-queue:v1:${userId}`;
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const [queue] = useState(
    () =>
      new SessionQueue({
        read: () => localStorage.getItem(storageKey),
        write: (value) =>
          value === null
            ? localStorage.removeItem(storageKey)
            : localStorage.setItem(storageKey, value),
        // 通信のロックと端末保存のロックを分け、別タブの同期中も入力を止めない。
        lock: (name, work) =>
          navigator.locks ? navigator.locks.request(`${storageKey}:${name}`, work) : work(),
        load: () =>
          api<TrainingSession | null>("/sessions/active", { signal: AbortSignal.timeout(15_000) }),
        send: (id, revision, exercises) =>
          api<TrainingSession>(`/sessions/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ expected_revision: revision, exercises }),
            signal: AbortSignal.timeout(15_000),
          }),
      }),
  );
  const state = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const startId = useRef<string | null>(null);
  const lastActivity = useRef(0);
  useEffect(() => {
    queue.start();
    void queue.restore().then(() => queue.sync());
    const retry = () => {
      if (!document.hidden) void queue.sync();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === storageKey) void queue.restore().then(retry);
    };
    const timer = window.setInterval(retry, 5000);
    window.addEventListener("online", retry);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", retry);
    return () => {
      queue.stop();
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [queue, storageKey]);
  useEffect(() => {
    if (state.saved) {
      lastActivity.current = Date.now();
      changed.current();
    }
  }, [state.saved]);
  const sessionId = state.session?.id;
  useEffect(() => {
    if (!sessionId) return;
    let pending = false;
    const beat = async () => {
      if (document.hidden || pending || Date.now() - lastActivity.current < 30_000) return;
      pending = true;
      try {
        await api(`/sessions/${sessionId}/heartbeat`, {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
        });
        lastActivity.current = Date.now();
      } catch {
        /* LIVEの一時切断で端末への入力を止めない。 */
      } finally {
        pending = false;
      }
    };
    void beat();
    const timer = window.setInterval(() => void beat(), 30_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [sessionId]);
  async function mutate(operation: () => Promise<TrainingSession>) {
    if (lock.current) throw new Error("処理中です。");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await operation();
      lastActivity.current = Date.now();
      await queue.accept(result);
      changed.current();
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存できませんでした。");
      throw reason;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    ...state,
    busy,
    error: error || (!state.ready ? state.error : ""),
    syncError: state.error,
    sync: () => queue.sync(),
    discardPending: () => queue.discardAfterConfirmation(),
    reload: async () => {
      try {
        await queue.restore();
        await queue.sync();
        setError("");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "復元できませんでした。");
      }
    },
    start: async () => {
      if (!state.ready) throw new Error("保存済みのトレーニングを確認しています。");
      if (state.session) return state.session;
      startId.current ??= crypto.randomUUID();
      const result = await mutate(() =>
        api<TrainingSession>("/sessions", {
          method: "POST",
          body: JSON.stringify({ id: startId.current }),
          signal: AbortSignal.timeout(15_000),
        }),
      );
      startId.current = null;
      return result;
    },
    save: async (exercises: Exercise[], revision = state.session?.revision) => {
      if (busy || revision === undefined) throw new Error("先にトレーニングを開始してください。");
      const result = await queue.enqueue(exercises, revision);
      void queue.sync();
      return result;
    },
    finish: () =>
      mutate(async () => {
        await queue.sync();
        const current = queue.state;
        if (current.pending)
          throw new Error(
            "未送信のセットを同期してから終了してください。入力は端末に保持しています。",
          );
        if (!current.session) throw new Error("トレーニングがありません。");
        return api<TrainingSession>(`/sessions/${current.session.id}/finish`, {
          method: "POST",
          body: JSON.stringify({ expected_revision: current.session.revision }),
          signal: AbortSignal.timeout(15_000),
        });
      }),
  };
}
export type SessionController = ReturnType<typeof useSession>;
