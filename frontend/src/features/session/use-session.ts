import { type Exercise, type TrainingSession, api } from "@/lib/api";
import { createSessionSender } from "@/lib/session-transport";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createSessionId } from "./session-id";
import { SessionQueue } from "./session-queue";

export function useSession(userId: string, onChanged: () => void, trainingVisible: boolean) {
  const storageKey = `gotore:session-queue:v1:${userId}`;
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const [queue] = useState(() => {
    const sender = createSessionSender(api<TrainingSession>);
    return new SessionQueue({
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
      send: (id, revision, exercises, activityAt) =>
        sender(id, revision, exercises, AbortSignal.timeout(15_000), activityAt),
      reconcile: (id, occurredAt) =>
        api<TrainingSession>(`/sessions/${id}/activity`, {
          method: "POST",
          body: JSON.stringify({ occurred_at: occurredAt }),
          signal: AbortSignal.timeout(15_000),
        }),
      finish: (id, revision) =>
        api<TrainingSession>(`/sessions/${id}/finish`, {
          method: "POST",
          body: JSON.stringify({ expected_revision: revision }),
          signal: AbortSignal.timeout(15_000),
        }),
    });
  });
  const state = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const startId = useRef<string | null>(null);
  const lastActivity = useRef(0);
  const [locallyExpired, setLocallyExpired] = useState(false);
  useEffect(() => {
    queue.start();
    let restoring: Promise<void> | null = null;
    const restore = () => {
      restoring ??= queue.restore().finally(() => {
        restoring = null;
      });
      return restoring;
    };
    void restore().then(() => queue.sync());
    const retry = () => {
      if (document.hidden) return;
      if (queue.getSnapshot().ready) void queue.sync();
      else
        void restore().then(() => {
          if (!document.hidden) void queue.sync();
        });
    };
    const storage = (event: StorageEvent) => {
      if (event.key === storageKey) void restore().then(retry);
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
    if (!sessionId) {
      setLocallyExpired(false);
      return;
    }
    let syncTimer = 0;
    const lastLocalActivity = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        const saved = raw ? JSON.parse(raw) : null;
        return saved?.lastActivityAt ?? saved?.base?.last_activity_at ?? saved?.base?.started_at;
      } catch {
        return null;
      }
    };
    const record = () => {
      if (!trainingVisible || locallyExpired || !queue.getSnapshot().session) return;
      const last = lastLocalActivity();
      if (last && Date.now() - Date.parse(last) >= 3_600_000) {
        check();
        return;
      }
      void queue
        .touch(new Date().toISOString())
        .then(() => {
          window.clearTimeout(syncTimer);
          syncTimer = window.setTimeout(() => void queue.sync(), 1000);
        })
        .catch((reason) =>
          setError(reason instanceof Error ? reason.message : "操作を保存できませんでした。"),
        );
    };
    const check = () => {
      const last = lastLocalActivity();
      if (last && Date.now() - Date.parse(last) >= 3_600_000) {
        setLocallyExpired(true);
        void queue.sync().then(() => queue.refresh());
      }
    };
    window.addEventListener("pointerdown", record);
    window.addEventListener("keydown", record);
    window.addEventListener("input", record);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 5000);
    check();
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(syncTimer);
      window.removeEventListener("pointerdown", record);
      window.removeEventListener("keydown", record);
      window.removeEventListener("input", record);
      document.removeEventListener("visibilitychange", check);
    };
  }, [sessionId, queue, storageKey, locallyExpired, trainingVisible]);
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
  async function mutate(operation: () => Promise<TrainingSession>, beforeAccept?: () => void) {
    if (lock.current) throw new Error("処理中です。");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await operation();
      beforeAccept?.();
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
    locallyExpired,
    session: locallyExpired ? null : state.session,
    finishPending: locallyExpired || state.finishPending,
    startingId: startId.current,
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
      if (queue.getSnapshot().finishPending)
        throw new Error("前のトレーニングの終了を確認しています。");
      if (state.session) return state.session;
      startId.current ??= createSessionId();
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
    finish: async (beforeAccept?: () => void) => {
      if (lock.current) throw new Error("処理中です。");
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        const result = await queue.requestFinish(beforeAccept);
        void queue.sync();
        return result;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "端末に保存できませんでした。");
        throw reason;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
  };
}
export type SessionController = ReturnType<typeof useSession>;
