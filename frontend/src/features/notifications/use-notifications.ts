import { api } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  disablePush,
  enablePush,
  notificationFeedback,
  restorePush,
  unlockNotificationSound,
} from "./browser-notifications";
import { NotificationQueue, liveStarts } from "./notification-queue";
import {
  type ActivityNotification,
  type NotificationSettings,
  defaultNotificationSettings,
} from "./types";

export function useNotifications(
  userId: string,
  view: string,
  enabled: boolean,
  sessionRevision: number,
) {
  const [settings, setSettings] = useState(defaultNotificationSettings);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [ackError, setAckError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushId, setPushId] = useState<string | null>(null);
  const [stamp, setStamp] = useState<ActivityNotification[] | null>(null);
  const [stampPaused, setStampPaused] = useState(false);
  const stampLifetime = useRef({ id: "", remaining: 0, started: 0 });
  const [starts, setStarts] = useState<ActivityNotification[]>([]);
  const [batch, setBatch] = useState(0);
  const [tick, setTick] = useState(0);
  const [queue] = useState(() => new NotificationQueue());
  const acknowledgements = useRef(new Set<string>());
  const activeStartIds = useRef(new Set<string>());
  const alive = useRef(true);
  const busyPoll = useRef(false);
  const ackBusy = useRef(false);
  const previousRevision = useRef(sessionRevision);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startsRef = useRef(starts);
  startsRef.current = starts;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const pushRef = useRef(pushId);
  pushRef.current = pushId;
  const visibleRef = useRef(enabled);
  visibleRef.current = enabled;
  const ack = useCallback(async () => {
    if (ackBusy.current || !acknowledgements.current.size) return;
    ackBusy.current = true;
    const ids = [...acknowledgements.current].slice(0, 100);
    try {
      await api("/notifications/seen", { method: "POST", body: JSON.stringify({ ids }) });
      for (const id of ids) acknowledgements.current.delete(id);
      if (alive.current) setAckError(false);
    } catch {
      if (alive.current) setAckError(true);
    } finally {
      ackBusy.current = false;
    }
  }, []);
  const displayed = useCallback(
    (items: ActivityNotification[], feedback = true) => {
      for (const item of items) acknowledgements.current.add(item.id);
      void ack();
      if (feedback) notificationFeedback(settingsRef.current.vibration, settingsRef.current.sound);
    },
    [ack],
  );
  const reloadSettings = useCallback(async () => {
    try {
      const value = await api<NotificationSettings>("/notifications/settings");
      if (alive.current) {
        setSettings(value);
        setReady(true);
        setError("");
      }
    } catch {
      if (alive.current) setError("通知設定を取得できません。再試行してください。");
    }
  }, []);
  const poll = useCallback(async () => {
    if (document.hidden || !visibleRef.current || busyPoll.current) return;
    busyPoll.current = true;
    try {
      if (pushRef.current)
        await api(`/notifications/presence/${pushRef.current}`, {
          method: "POST",
          body: JSON.stringify({ active: true }),
        });
      const data = await api<{ items: ActivityNotification[]; live_start_ids: string[] }>(
        "/notifications/inbox",
      );
      if (!alive.current) return;
      activeStartIds.current = new Set(data.live_start_ids);
      queue.pruneStarts(activeStartIds.current);
      queue.receive(data.items);
      setStarts((current) => liveStarts(current).filter((x) => activeStartIds.current.has(x.id)));
      setTick((x) => x + 1);
      void ack();
    } catch {
      /* 一時的な取得失敗では待機イベントを捨てず、次の取得で再試行する。 */
    } finally {
      busyPoll.current = false;
    }
  }, [queue, ack]);
  useEffect(() => {
    alive.current = true;
    void reloadSettings();
    void restorePush()
      .then((x) => {
        if (alive.current) setPushId(x?.id || null);
      })
      .catch(() => {});
    const unlock = () => {
      if (settingsRef.current.sound) unlockNotificationSound();
    };
    document.addEventListener("pointerdown", unlock, { passive: true });
    return () => {
      alive.current = false;
      document.removeEventListener("pointerdown", unlock);
      if (startTimer.current) clearTimeout(startTimer.current);
    };
  }, [reloadSettings]);
  useEffect(() => {
    if (!enabled || !ready) return;
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    const resume = () => {
      if (!document.hidden) {
        void poll();
        setTick((x) => x + 1);
      } else if (pushRef.current)
        void api(`/notifications/presence/${pushRef.current}`, {
          method: "POST",
          body: JSON.stringify({ active: false }),
          keepalive: true,
        }).catch(() => {});
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("demo-notifications", resume);
    navigator.serviceWorker?.addEventListener("message", resume);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("demo-notifications", resume);
      navigator.serviceWorker?.removeEventListener("message", resume);
    };
  }, [enabled, ready, poll]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tickは共有キューへの到着と再表示の合図。
  useEffect(() => {
    if (!enabled || !ready || document.hidden || stamp) return;
    const next = queue.nextStamps();
    if (!next) return;
    if (!settings.stamp_enabled) {
      displayed(next, false);
      setTick((x) => x + 1);
      return;
    }
    setStamp(next);
    displayed(next);
  }, [enabled, ready, stamp, settings.stamp_enabled, queue, displayed, tick]);
  useEffect(() => {
    if (!stamp || stampPaused) return;
    const clock = stampLifetime.current;
    if (clock.id !== stamp[0].id) {
      clock.id = stamp[0].id;
      clock.remaining = stamp.length > 1 ? 2500 : 650;
    }
    clock.started = Date.now();
    const timer = window.setTimeout(() => setStamp(null), clock.remaining);
    return () => window.clearTimeout(timer);
  }, [stamp, stampPaused]);
  const dismissStamp = useCallback(() => {
    setStamp(null);
    setStampPaused(false);
  }, []);
  function pauseStamp() {
    const clock = stampLifetime.current;
    clock.remaining = Math.max(0, clock.remaining - (Date.now() - clock.started));
    setStampPaused(true);
  }
  function resumeStamp() {
    setStampPaused(false);
  }
  const dismissStart = useCallback(() => {
    if (startTimer.current) clearTimeout(startTimer.current);
    startTimer.current = null;
    startsRef.current = [];
    setStarts([]);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tickと保存revisionで待機中の開始を表示する。
  useEffect(() => {
    const afterSet = sessionRevision > previousRevision.current;
    previousRevision.current = sessionRevision;
    if (!enabled || !ready || document.hidden) return;
    const canShow =
      view === "home" ||
      settings.start_timing === "now" ||
      (view === "record" && settings.start_timing === "set" && afterSet);
    if (!canShow && settings.start_enabled) return;
    const next = queue.takeStarts();
    if (!next.length) return;
    if (!settings.start_enabled) {
      displayed(next, false);
      return;
    }
    const first = !startsRef.current.length;
    const combined = [...startsRef.current, ...next];
    startsRef.current = combined;
    setStarts(combined);
    displayed(next);
    if (first) {
      setBatch((x) => x + 1);
      if (startTimer.current) clearTimeout(startTimer.current);
      startTimer.current = setTimeout(dismissStart, 5000);
    }
  }, [
    enabled,
    ready,
    view,
    sessionRevision,
    settings.start_enabled,
    settings.start_timing,
    queue,
    displayed,
    dismissStart,
    tick,
  ]);
  useEffect(() => {
    if (!starts.length) return;
    const tap = () => dismissStart();
    document.addEventListener("click", tap, true);
    return () => document.removeEventListener("click", tap, true);
  }, [starts.length, dismissStart]);
  useEffect(() => {
    if (view === "record" && settings.start_timing === "home") dismissStart();
  }, [view, settings.start_timing, dismissStart]);
  async function saveSettings(value: NotificationSettings) {
    if (saving) return;
    const previous = settings;
    setSettings(value);
    setSaving(true);
    setError("");
    try {
      const saved = await api<NotificationSettings>("/notifications/settings", {
        method: "PUT",
        body: JSON.stringify(value),
      });
      setSettings(saved);
      if (!saved.stamp_enabled) dismissStamp();
      if (!saved.start_enabled) dismissStart();
    } catch {
      setSettings(previous);
      setError("通知設定を保存できません。再試行してください。");
    } finally {
      setSaving(false);
    }
  }
  async function revokePush() {
    setSaving(true);
    setError("");
    try {
      await disablePush();
      setPushId(null);
    } catch {
      setError("端末通知を解除できません。再試行してください。");
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    const closeWithEscape = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        e.target instanceof Element &&
        e.target.closest(".activity-notifications")
      ) {
        dismissStamp();
        dismissStart();
      }
    };
    document.addEventListener("keydown", closeWithEscape);
    return () => document.removeEventListener("keydown", closeWithEscape);
  }, [dismissStamp, dismissStart]);
  async function requestPush() {
    setSaving(true);
    setError("");
    try {
      const x = await enablePush();
      setPushId(x.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通知を有効にできません。");
    } finally {
      setSaving(false);
    }
  }
  return {
    userId,
    settings,
    ready,
    error,
    ackError,
    saving,
    pushId,
    stamp,
    starts,
    batch,
    saveSettings,
    requestPush,
    reloadSettings,
    dismissStart,
    dismissStamp,
    pauseStamp,
    resumeStamp,
    revokePush,
    retryAck: ack,
  };
}
