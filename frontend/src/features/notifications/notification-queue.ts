import { stampKinds } from "../stamps/types";
import type { ActivityNotification } from "./types";
export function stampCounts(items: ActivityNotification[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const emoji = stampKinds.find((x) => x.id === item.stamp_kind)?.emoji;
    if (emoji) counts.set(emoji, (counts.get(emoji) || 0) + 1);
  }
  return [...new Set(stampKinds.map((x) => x.emoji))]
    .filter((x) => counts.has(x))
    .map((emoji) => ({ emoji, count: counts.get(emoji) || 0 }));
}
export function liveStarts(items: ActivityNotification[], now = Date.now()) {
  return items.filter((x) => x.kind === "start" && x.live_until && Date.parse(x.live_until) > now);
}
export class NotificationQueue {
  private known = new Set<string>();
  private stamps: ActivityNotification[] = [];
  private starts: ActivityNotification[] = [];
  receive(items: ActivityNotification[]) {
    for (const item of items) {
      if (this.known.has(item.id)) continue;
      this.known.add(item.id);
      (item.kind === "stamp" ? this.stamps : this.starts).push(item);
    }
  }
  nextStamps() {
    if (!this.stamps.length) return null;
    const group =
      this.stamps.length >= 10 || new Set(this.stamps.map((x) => x.sender_id)).size >= 5;
    return this.stamps.splice(0, group ? this.stamps.length : 1);
  }
  takeStarts(exclude = new Set<string>()) {
    const items = liveStarts(this.starts).filter((x) => !exclude.has(x.id));
    this.starts = [];
    return items;
  }
  pruneStarts(ids: Set<string>) {
    this.starts = this.starts.filter((x) => ids.has(x.id));
  }
  clearStamps() {
    this.stamps = [];
  }
}
