import type { RecordSnapshot } from "@/lib/record-snapshot";
import { personalHistorySummary } from "./personal-history-summary";
import { personalMonthlyActivity } from "./personal-monthly-activity";

export function cachedRecordResource(
  snapshot: RecordSnapshot | null,
  path: string | null,
): unknown {
  if (!snapshot || !path) return null;
  if (path === "/exercise-options") return snapshot.options;
  if (path === "/history/summary") return personalHistorySummary(snapshot);
  const [pathname, query] = path.split("?", 2);
  if (pathname === "/workouts/activity") {
    const params = new URLSearchParams(query);
    const month = params.get("month");
    if (
      !month ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      [...params.keys()].some((key) => key !== "month" && key !== "exercise")
    )
      return null;
    return personalMonthlyActivity(snapshot, month, params.get("exercise"));
  }
  if (pathname !== "/workouts") return null;
  const params = new URLSearchParams(query);
  if (
    [...params.keys()].some(
      (key) =>
        !["offset", "limit", "performed_on", "date_from", "date_to", "exercise"].includes(key),
    )
  )
    return null;
  const offset = Number(params.get("offset") ?? 0);
  const limit = Number(params.get("limit") ?? 50);
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    return null;
  const date = params.get("performed_on");
  const from = params.get("date_from");
  const to = params.get("date_to");
  const exercise = params.get("exercise");
  return snapshot.workouts
    .filter((record) => record.exercises.length > 0)
    .filter((record) => !date || record.performed_on === date)
    .filter((record) => !from || record.performed_on >= from)
    .filter((record) => !to || record.performed_on <= to)
    .filter((record) => !exercise || record.exercises.some((item) => item.name === exercise))
    .slice(offset, offset + limit);
}
