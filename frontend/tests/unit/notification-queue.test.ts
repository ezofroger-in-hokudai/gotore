import { expect, test } from "bun:test";
import {
  NotificationQueue,
  stampCounts,
} from "../../src/features/notifications/notification-queue";
import type { ActivityNotification } from "../../src/features/notifications/types";
function event(
  i: number,
  kind: "stamp" | "start" = "stamp",
  sender = String(i),
): ActivityNotification {
  return {
    id: String(i),
    kind,
    sender_id: sender,
    display_name: sender,
    workout_id: "w",
    stamp_kind: "push",
    created_at: new Date().toISOString(),
    live_until: kind === "start" ? new Date(Date.now() + 300000).toISOString() : null,
  };
}
test("5送り主と10件で集約、個別/まとめを表示した分だけ確認する", () => {
  const q = new NotificationQueue();
  q.receive([event(1)]);
  expect(q.nextStamps()?.length).toBe(1);
  q.receive([2, 3, 4, 5].map((i) => event(i)));
  expect(q.nextStamps()?.length).toBe(1);
  const r = new NotificationQueue();
  r.receive([1, 2, 3, 4, 5].map((i) => event(i)));
  expect(r.nextStamps()?.length).toBe(5);
  const t = new NotificationQueue();
  t.receive(Array.from({ length: 10 }, (_, i) => event(i, "stamp", "same")));
  expect(t.nextStamps()?.length).toBe(10);
  expect(stampCounts([event(1), { ...event(2), stamp_kind: "fire" }])).toEqual([
    { emoji: "🔥", count: 2 },
  ]);
});
test("画面変更でスタンプを落とさず、重複と終了済み開始を除く", () => {
  const q = new NotificationQueue();
  q.receive([event(1), event(1), event(2, "start")]);
  expect(q.nextStamps()?.length).toBe(1);
  expect(q.nextStamps()).toBeNull();
  q.receive([{ ...event(3, "start"), live_until: new Date(0).toISOString() }]);
  expect(q.takeStarts(new Set(["2"]))).toHaveLength(0);
});
