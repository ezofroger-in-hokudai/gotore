import type { ActivityBodyPart, MonthlyActivity } from "@/lib/api";
import { BODY_PARTS, BODY_PART_LABELS, type BodyPartFilter } from "../exercises/body-parts";

export function orderedParts(parts: ActivityBodyPart[] = []) {
  return parts
    .map((part) => ({
      ...part,
      label: part.body_part ? BODY_PART_LABELS[part.body_part] : "未分類",
    }))
    .sort(
      (a, b) =>
        (a.body_part ? BODY_PARTS.indexOf(a.body_part) : BODY_PARTS.length) -
        (b.body_part ? BODY_PARTS.indexOf(b.body_part) : BODY_PARTS.length),
    );
}

export function activityForPart(activity: MonthlyActivity, part: BodyPartFilter): MonthlyActivity {
  if (part === "all") return activity;
  const wanted = part === "unclassified" ? null : part;
  const days = activity.days.flatMap((day) => {
    const value = day.body_parts?.find((entry) => entry.body_part === wanted);
    return value ? [{ date: day.date, ...value, body_parts: [value] }] : [];
  });
  return {
    ...activity,
    days,
    total_volume: days.reduce((total, day) => total + day.volume, 0),
    total_sets: days.reduce((total, day) => total + day.set_count, 0),
    workout_count: days.reduce((total, day) => total + day.workout_count, 0),
    active_days: days.length,
  };
}
