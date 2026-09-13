import type { ActivityBodyPart, MonthlyActivity } from "@/lib/api";
import {
  BODY_PARTS,
  BODY_PART_LABELS,
  type BodyPartFilter,
  normalizeBodyPart,
} from "../exercises/body-parts";

export function orderedParts(parts: ActivityBodyPart[] = []) {
  return BODY_PARTS.flatMap((body_part) => {
    const matches = parts.filter((entry) => normalizeBodyPart(entry.body_part) === body_part);
    return matches.length
      ? [
          {
            body_part,
            label: BODY_PART_LABELS[body_part],
            volume: matches.reduce((total, entry) => total + entry.volume, 0),
            set_count: matches.reduce((total, entry) => total + entry.set_count, 0),
          },
        ]
      : [];
  });
}

export function activityForPart(activity: MonthlyActivity, part: BodyPartFilter): MonthlyActivity {
  if (part === "all") return activity;
  const days = activity.days.flatMap((day) => {
    const value = day.body_parts?.find((entry) => entry.body_part === part);
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
