export const stampChoices = [
  { id: "encourage", emoji: "💪", label: "がんばれ" },
  { id: "push", emoji: "🔥", label: "まだまだ" },
  { id: "bad", emoji: "👎", label: "バッド" },
  { id: "amazing", emoji: "🤩", label: "すごい" },
  { id: "praise", emoji: "👏", label: "えらい" },
  { id: "tengu", emoji: "👺", label: "天狗" },
] as const;

export const stampKinds = [
  ...stampChoices,
  { id: "clap", emoji: "👏", label: "おつかれ！" },
  { id: "fire", emoji: "🔥", label: "ナイス！" },
  { id: "muscle", emoji: "💪", label: "一緒にがんばろう" },
  { id: "eyes", emoji: "👀", label: "見たよ" },
] as const;
export type StampKind = (typeof stampKinds)[number]["id"];
export type StampItem = {
  id: string;
  workout_id: string;
  group_id: string;
  group_name: string;
  sender_id: string;
  display_name: string;
  kind: StampKind;
  created_at: string;
  performed_on: string;
  exercise: string;
  read: boolean;
  announced: boolean;
  mine: boolean;
};
export type StampSummary = {
  counts: Partial<Record<StampKind, number>>;
  mine: StampKind[];
  can_send: boolean;
};
export type StampList = {
  counts?: Partial<Record<StampKind, number>>;
  target?: { group_name: string; performed_on: string } | null;
  items: StampItem[];
  total: number;
  people: number;
  unread: number;
  mine: StampKind[];
  can_send: boolean;
  has_more: boolean;
};
export function inboxPath(groupId?: string, workoutId?: string, offset = 0) {
  const params = new URLSearchParams({ offset: String(offset) });
  if (groupId) params.set("group_id", groupId);
  if (workoutId) params.set("workout_id", workoutId);
  return `/stamps/inbox?${params}`;
}
