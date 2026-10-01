import { useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "../v2/avatar";
import { stampCounts } from "./notification-queue";
import type { useNotifications } from "./use-notifications";
import "./activity-notifications.css";

export function ActivityNotifications({
  notifications: n,
  recording,
}: { notifications: ReturnType<typeof useNotifications>; recording: boolean }) {
  const faces = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const [faceLimit, setFaceLimit] = useState(1);
  const stampPeople = n.stamp ? [...new Map(n.stamp.map((x) => [x.sender_id, x])).values()] : [];
  const people = [...new Map(n.starts.map((x) => [x.sender_id, x])).values()];
  const peopleCount = people.length;
  useLayoutEffect(() => {
    const node = faces.current;
    if (!node) return;
    const update = () => {
      const size = recording ? 24 : 34;
      let fit = Math.min(peopleCount, Math.floor((node.clientWidth + 7) / (size + 7)));
      while (
        fit > 1 &&
        fit * size +
          (fit - 1) * 7 +
          (fit < peopleCount ? 35 + String(peopleCount - fit).length * 7 : 0) >
          node.clientWidth
      )
        fit--;
      setFaceLimit(Math.max(1, fit));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [peopleCount, recording]);
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
          <section
            key={n.batch}
            className={`activity-start activity-start-enter${recording ? " activity-start-small" : ""}`}
            aria-label="トレーニング開始通知"
          >
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
