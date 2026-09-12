import type { GroupSummary } from "@/lib/api";

export const GROUP_REFRESH_MS = 60_000;

export function activityRefreshMs(data: GroupSummary | undefined) {
  return data?.live_count ? 5000 : 15_000;
}

export function summaryRefreshMs(data: GroupSummary[] | undefined) {
  return data?.some((group) => group.live_count > 0) ? 5000 : 15_000;
}
