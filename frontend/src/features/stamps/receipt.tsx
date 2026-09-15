import { api } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useResource } from "../training/use-resource";
import { StampInbox } from "./inbox";
import { type StampItem, type StampList, inboxPath, stampKinds } from "./types";

export function StampReceipt({
  workoutId,
  active = true,
  live = true,
}: { workoutId: string; active?: boolean; live?: boolean }) {
  const resource = useResource<StampList>(
    inboxPath(undefined, workoutId),
    0,
    live ? 10000 : false,
    false,
    { enabled: active },
  );
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const [flash, setFlash] = useState<StampItem[]>([]);
  const shown = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  const [ackError, setAckError] = useState(false);
  const data = resource.error ? null : resource.data;
  const acknowledge = useCallback(async () => {
    const ids = [...pending.current].slice(0, 100);
    if (!ids.length) return;
    try {
      await api("/stamps/seen", { method: "POST", body: JSON.stringify({ ids, read: false }) });
      for (const id of ids) pending.current.delete(id);
      setAckError(false);
    } catch {
      setAckError(true);
    }
  }, []);
  useEffect(() => {
    if (!active || !visible || !live || !data) {
      setFlash([]);
      return;
    }
    const next = data.items.filter((item) => !item.announced && !shown.current.has(item.id));
    if (!next.length) return;
    for (const item of next) {
      shown.current.add(item.id);
      pending.current.add(item.id);
    }
    setFlash(next);
    void acknowledge();
  }, [data, active, visible, live, acknowledge]);
  useEffect(() => {
    if (!flash.length) return;
    const timer = window.setTimeout(() => setFlash([]), 5000);
    return () => window.clearTimeout(timer);
  }, [flash]);
  const visibleFlash =
    active && visible && data
      ? flash.filter((item) => data.items.some((current) => current.id === item.id))
      : [];
  const latest = visibleFlash[0];
  return (
    <section
      className={live ? "stamp-receipt-slot" : "stamp-result"}
      aria-label={live ? "記録中のスタンプ" : "今回届いたスタンプ"}
    >
      {!live && <h2>今回届いたスタンプ</h2>}
      <button
        type="button"
        className={`stamp-receipt${latest ? " stamp-arrived" : ""}`}
        onClick={() => setOpen(true)}
      >
        <span className="stamp-receipt-icon">
          {latest ? stampKinds.find((s) => s.id === latest.kind)?.emoji : "♡"}
        </span>
        <span className="stamp-receipt-copy">
          {latest
            ? `${latest.display_name}から${visibleFlash.length > 1 ? ` ほか${visibleFlash.length - 1}件` : ""}`
            : "届いたスタンプ"}
          <small>
            {latest ? latest.group_name : data ? `${data.people}人から ${data.total}個` : ""}
          </small>
        </span>
        <span className="stamp-unread">{data?.unread ? `未読 ${data.unread}` : "見る"} ›</span>
      </button>
      <span className="stamp-sr" aria-live="polite">
        {latest ? `${latest.display_name}からスタンプが届きました` : ""}
      </span>
      {resource.error && (
        <p className="error stamp-receipt-error" role="alert">
          スタンプを取得できません
          <button type="button" onClick={resource.retry}>
            再試行
          </button>
        </p>
      )}
      {ackError && (
        <p className="error stamp-receipt-error">
          受信状態を保存できません
          <button type="button" onClick={() => void acknowledge()}>
            再試行
          </button>
        </p>
      )}
      {open && active && (
        <StampInbox
          workoutId={workoutId}
          onClose={() => {
            setOpen(false);
            setFlash([]);
            resource.retry();
          }}
        />
      )}
    </section>
  );
}
