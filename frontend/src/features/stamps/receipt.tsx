import { api } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useResource } from "../training/use-resource";
import { StampInbox } from "./inbox";
import { StampSummaryRow } from "./stamp-summary-row";
import { type StampItem, type StampList, inboxPath } from "./types";

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
      className={live ? "stamp-receipt-slot stamp-live" : "stamp-result"}
      aria-label={live ? "記録中のスタンプ" : "今回届いたスタンプ"}
    >
      {!live && <h2>今回届いたスタンプ</h2>}
      <StampSummaryRow
        data={data}
        newKinds={visibleFlash.map((item) => item.kind)}
        onOpen={() => setOpen(true)}
        onRetry={resource.error ? resource.retry : undefined}
        onRetryAcknowledgement={ackError ? () => void acknowledge() : undefined}
      />
      <span className="stamp-sr" aria-live="polite">
        {latest ? `${latest.display_name}からスタンプが届きました` : ""}
      </span>
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
