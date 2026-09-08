import { type Exercise, type TrainingSession, api } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";

export function useSession(onChanged: () => void) {
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const startId = useRef<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const current = await api<TrainingSession | null>("/sessions/active");
      setSession(current);
      setReady(true);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "復元できませんでした。");
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;
    let pending = false;
    const beat = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        await api(`/sessions/${sessionId}/heartbeat`, { method: "POST" });
      } catch {
        if (!stopped)
          setError("LIVEの接続を確認できません。保存済みを読み直すか、接続を確認してください。");
      } finally {
        pending = false;
      }
    };
    void beat();
    const timer = window.setInterval(() => void beat(), 30_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [sessionId]);

  async function mutate(path: string, body: unknown, method = "POST") {
    if (lock.current) throw new Error("保存中です。");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<TrainingSession>(path, { method, body: JSON.stringify(body) });
      setSession(result.ended_at ? null : result);
      onChanged();
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
    session,
    ready,
    busy,
    error,
    reload,
    start: async () => {
      if (!ready) throw new Error("保存済みのトレーニングを確認しています。");
      if (session) return session;
      startId.current ??= crypto.randomUUID();
      const result = await mutate("/sessions", { id: startId.current });
      startId.current = null;
      return result;
    },
    save: (exercises: Exercise[]) => {
      if (!session) throw new Error("先にトレーニングを開始してください。");
      return mutate(
        `/sessions/${session.id}`,
        { expected_revision: session.revision, exercises },
        "PATCH",
      );
    },
    finish: () => {
      if (!session) throw new Error("トレーニングがありません。");
      return mutate(`/sessions/${session.id}/finish`, { expected_revision: session.revision });
    },
  };
}
export type SessionController = ReturnType<typeof useSession>;
