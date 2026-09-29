"use client";

import { api } from "@/lib/api";
import {
  type RecordChanges,
  type RecordSnapshot,
  applyRecordChanges,
  clearRecordSnapshot,
  readRecordSnapshot,
  recordManifest,
  saveRecordSnapshot,
  validChanges,
  validSnapshot,
} from "@/lib/record-snapshot";
import { sessionBody as compressedJsonBody } from "@/lib/session-transport";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type RecordCache = {
  snapshot: RecordSnapshot | null;
  storageError: boolean;
  refresh: () => Promise<void>;
  clear: () => Promise<void>;
  resume: () => void;
  removeWorkout: (id: string) => void;
};

const Context = createContext<RecordCache | null>(null);

export function RecordSnapshotProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<RecordSnapshot | null>(null);
  const currentSnapshot = useRef<RecordSnapshot | null>(null);
  const [storageError, setStorageError] = useState(false);
  const request = useRef<Promise<void> | null>(null);
  const clearing = useRef(false);
  const epoch = useRef(0);
  const rerun = useRef(false);
  const lastRefresh = useRef(0);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const persist = useCallback((value: RecordSnapshot) => {
    writes.current = writes.current.catch(() => {}).then(() => saveRecordSnapshot(value));
    void writes.current.then(
      () => setStorageError(false),
      () => setStorageError(true),
    );
  }, []);
  const refresh = useCallback(() => {
    if (clearing.current) return Promise.resolve();
    if (request.current) {
      rerun.current = true;
      return request.current;
    }
    const startedAtEpoch = epoch.current;
    const base = currentSnapshot.current;
    const signal = AbortSignal.timeout(15_000);
    const pending = (
      base
        ? compressedJsonBody(JSON.stringify(recordManifest(base)), signal).then((payload) =>
            api<RecordChanges>("/me/record-snapshot/changes", {
              method: "POST",
              ...payload,
              signal,
            }),
          )
        : api<RecordSnapshot>("/me/record-snapshot", {
            signal,
          })
    )
      .then(async (value) => {
        if (base && !validChanges(value, userId)) throw new Error("記録の差分を確認できません");
        const next = base
          ? applyRecordChanges(base, value as RecordChanges)
          : (value as RecordSnapshot);
        if (!validSnapshot(next, userId)) throw new Error("記録データを確認できません");
        if (startedAtEpoch !== epoch.current || clearing.current) {
          rerun.current = true;
          return;
        }
        lastRefresh.current = Date.now();
        if (next !== base) {
          currentSnapshot.current = next;
          setSnapshot(next);
          persist(next);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (request.current === pending) {
          request.current = null;
          if (rerun.current && !clearing.current) {
            rerun.current = false;
            void refresh();
          }
        }
      });
    request.current = pending;
    return pending;
  }, [userId, persist]);
  useEffect(() => {
    let cancelled = false;
    void readRecordSnapshot(userId)
      .then((saved) => {
        if (!cancelled && saved && !currentSnapshot.current) {
          currentSnapshot.current = saved;
          setSnapshot(saved);
        }
      })
      .catch(() => {
        if (!cancelled) setStorageError(true);
      })
      .finally(() => {
        if (!cancelled) void refresh();
      });
    const visible = () => {
      if (!document.hidden && Date.now() - lastRefresh.current > 30_000) void refresh();
    };
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      window.removeEventListener("online", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId, refresh]);
  const clear = useCallback(async () => {
    clearing.current = true;
    epoch.current++;
    try {
      await request.current;
      await writes.current.catch(() => {});
      await clearRecordSnapshot(userId);
      currentSnapshot.current = null;
      setSnapshot(null);
    } catch (error) {
      clearing.current = false;
      throw error;
    }
  }, [userId]);
  const resume = useCallback(() => {
    clearing.current = false;
    void refresh();
  }, [refresh]);
  const removeWorkout = useCallback(
    (id: string) => {
      epoch.current++;
      const current = currentSnapshot.current;
      if (!current) return;
      const { [id]: _removed, ...workoutMemos } = current.workout_memos;
      const { [id]: _sessionRemoved, ...sessionMemos } = current.session_exercise_memos;
      const next = {
        ...current,
        workouts: current.workouts.filter((record) => record.id !== id),
        workout_memos: workoutMemos,
        session_exercise_memos: sessionMemos,
      };
      currentSnapshot.current = next;
      setSnapshot(next);
      persist(next);
      void refresh();
    },
    [persist, refresh],
  );
  return (
    <Context.Provider value={{ snapshot, storageError, refresh, clear, resume, removeWorkout }}>
      {children}
    </Context.Provider>
  );
}

export function useRecordSnapshot() {
  return useContext(Context);
}
