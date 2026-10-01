import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "../v2/avatar";
import { stampCounts } from "./notification-queue";
import type { useNotifications } from "./use-notifications";
import "./activity-notifications.css";

export function ActivityNotifications({
  notifications: n,
  recording,
}: { notifications: ReturnType<typeof useNotifications>; recording: boolean }) {
  const position = useRef<HTMLDivElement>(null);
  const faces = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState({ items: n.starts, batch: n.batch, leaving: false });
  useLayoutEffect(() => {
    setDisplay((current) =>
      n.starts.length
        ? { items: n.starts, batch: n.batch, leaving: false }
        : current.items.length && !current.leaving
          ? { ...current, leaving: true }
          : current,
    );
  }, [n.starts, n.batch]);
  useEffect(() => {
    if (!display.leaving) return;
    const timer = window.setTimeout(
      () =>
        setDisplay((current) =>
          current.leaving ? { ...current, items: [], leaving: false } : current,
        ),
      200,
    );
    return () => window.clearTimeout(timer);
  }, [display.leaving]);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const [faceLimit, setFaceLimit] = useState(1);
  const stampPeople = n.stamp ? [...new Map(n.stamp.map((x) => [x.sender_id, x])).values()] : [];
  const people = [...new Map(display.items.map((x) => [x.sender_id, x])).values()];
  const peopleCount = people.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 同じ人数の新バッチでも差し替わった顔列を監視し直す。
  useLayoutEffect(() => {
    const node = faces.current;
    const anchor = position.current;
    if (!node || !anchor) return;
    let frame = 0;
    let watch: Element | null = null;
    const update = () => {
      const layer = anchor.parentElement?.getBoundingClientRect();
      if (!layer) return;
      const viewport = window.visualViewport;
      const dock = recording
        ? document.querySelector(".recording-view .recording-entry-dock")?.getBoundingClientRect()
        : null;
      const middle = dock
        ? Math.max(150, (48 + dock.top) / 2)
        : (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) / 2;
      anchor.style.top = `${middle - layer.top}px`;
      const nextWatch = document.querySelector(".floating-training");
      if (nextWatch !== watch) {
        watchObserver.disconnect();
        watch = nextWatch;
        if (watch) watchObserver.observe(watch, { attributes: true, attributeFilter: ["style"] });
      }
      const row = node.getBoundingClientRect();
      const clock = watch?.getBoundingClientRect();
      const overlap = clock && row.top < clock.bottom && row.bottom > clock.top;
      const space = overlap ? clock.width + 16 : 0;
      const left = clock && clock.left + clock.width / 2 < layer.left + layer.width / 2;
      node.style.paddingLeft = `${overlap && left ? space : 0}px`;
      node.style.paddingRight = `${overlap && !left ? space : 0}px`;
      const width = node.clientWidth - space;
      const size = recording ? 24 : 34;
      let fit = Math.min(peopleCount, Math.floor((width + 7) / (size + 7)));
      while (
        fit > 1 &&
        fit * size +
          (fit - 1) * 7 +
          (fit < peopleCount ? 35 + String(peopleCount - fit).length * 7 : 0) >
          width
      )
        fit--;
      setFaceLimit(Math.max(1, fit));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const watchObserver = new MutationObserver(schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    observer.observe(anchor.parentElement as Element);
    const dock = document.querySelector(".recording-view .recording-entry-dock");
    if (dock) observer.observe(dock);
    // 画面切替で時計や入力ドックが差し替わった場合にも位置を測り直す。
    const treeObserver = new MutationObserver(schedule);
    treeObserver.observe(document.querySelector(".v2-app") ?? document.body, {
      childList: true,
      subtree: true,
    });
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      watchObserver.disconnect();
      treeObserver.disconnect();
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [peopleCount, recording, display.batch]);
  return (
    <>
      <section className="activity-notifications" aria-label="受信通知">
        {n.stamp && (
          <section
            className="activity-stamp"
            key={n.stamp[0].id}
            aria-label="スタンプ通知"
            onPointerDown={(e) => {
              if (!e.isPrimary) return;
              n.pauseStamp();
              gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={(e) => {
              const g = gesture.current;
              gesture.current = null;
              if (!g || g.id !== e.pointerId) return;
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
              const dx = e.clientX - g.x;
              const dy = e.clientY - g.y;
              if (dy <= -48 && Math.abs(dy) > Math.abs(dx) * 1.3) n.dismissStamp();
              else n.resumeStamp();
            }}
            onPointerCancel={() => {
              gesture.current = null;
              n.resumeStamp();
            }}
          >
            <div className="activity-stamp-heading">
              <strong>
                {n.stamp.length === 1
                  ? `${n.stamp[0].display_name}からスタンプ`
                  : `${n.stamp.length}件のスタンプが届いた`}
              </strong>
              <div className="activity-senders">
                {stampPeople.slice(0, 3).map((x) => (
                  <Avatar
                    key={x.sender_id}
                    userId={x.sender_id}
                    name={x.display_name}
                    version={x.avatar_version}
                  />
                ))}
                {stampPeople.length > 3 && <small>+{stampPeople.length - 3}</small>}
              </div>
            </div>
            <div className="activity-stamp-kinds">
              {stampCounts(n.stamp).map((x) => (
                <span className="activity-stamp-kind" key={x.emoji}>
                  <b>{x.emoji}</b>
                  <small>×{x.count}</small>
                </span>
              ))}
            </div>
            <button className="activity-dismiss" type="button" onClick={n.dismissStamp}>
              スタンプ通知を閉じる
            </button>
          </section>
        )}
        {people.length > 0 && (
          <div ref={position} className="activity-start-position">
            <section
              key={display.batch}
              className={`activity-start ${display.leaving ? "activity-start-leave" : "activity-start-enter"}${recording ? " activity-start-small" : ""}`}
              aria-label="トレーニング開始通知"
            >
              <span className="activity-start-shine" aria-hidden="true" />
              <div className="activity-live-label">● LIVE</div>
              {people.length < 3 && (
                <div className="activity-start-names">
                  {people.map((x) => x.display_name).join("・")}
                </div>
              )}
              <strong>{people.length}人がトレーニング開始</strong>
              <div ref={faces} className="activity-start-faces">
                {people.slice(0, faceLimit).map((x) => (
                  <Avatar
                    key={x.sender_id}
                    userId={x.sender_id}
                    name={x.display_name}
                    version={x.avatar_version}
                  />
                ))}
                {people.length > faceLimit && (
                  <span className="activity-start-extra">+{people.length - faceLimit}</span>
                )}
              </div>
              <button type="button" className="activity-dismiss" onClick={n.dismissStart}>
                開始通知を閉じる
              </button>
            </section>
          </div>
        )}
      </section>
      {n.ackError && (
        <div className="activity-notification-error" role="alert">
          通知の確認を保存できません。
          <button type="button" onClick={() => void n.retryAck()}>
            再試行
          </button>
        </div>
      )}
    </>
  );
}
