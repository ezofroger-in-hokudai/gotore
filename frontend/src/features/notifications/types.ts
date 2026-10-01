import type { StampKind } from "../stamps/types";
export type ActivityNotification = {
  id: string;
  kind: "stamp" | "start";
  sender_id: string;
  display_name: string;
  avatar_version?: string | null;
  workout_id: string;
  stamp_kind: StampKind | null;
  created_at: string;
  live_until: string | null;
};
export type NotificationSettings = {
  stamp_enabled: boolean;
  start_enabled: boolean;
  start_timing: "home" | "now" | "set";
  vibration: boolean;
  sound: boolean;
  push_stamp: boolean;
  push_start: boolean;
};
export const defaultNotificationSettings: NotificationSettings = {
  stamp_enabled: true,
  start_enabled: true,
  start_timing: "home",
  vibration: true,
  sound: false,
  push_stamp: true,
  push_start: true,
};
