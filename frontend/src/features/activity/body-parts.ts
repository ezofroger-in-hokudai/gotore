import type { ActivityBodyPart, BodyPart, MonthlyActivity } from "@/lib/api";
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

export function toggleActivityPart(parts: BodyPart[], part: BodyPartFilter): BodyPart[] {
  if (part === "all") return [];
  return parts.includes(part) ? parts.filter((value) => value !== part) : [...parts, part];
}

export function activityForPart(activity: MonthlyActivity, part: BodyPartFilter) {
  return activityForParts(activity, part === "all" ? [] : [part]);
}

export function activityForParts(activity: MonthlyActivity, parts: BodyPart[]) {
  if (!parts.length) return activity;
  const selected = new Set(parts);
  const days = activity.days.flatMap((day) => {
    const matches =
      day.body_parts?.filter((entry) => selected.has(entry.body_part as BodyPart)) ?? [];
    if (!matches.length) return [];
    // 旧応答で部位間の重複が分からない場合は、件数を単純加算しない。
    const workout_count = day.workout_groups
      ? day.workout_groups.reduce(
          (total, group) =>
            total + (group.body_parts.some((part) => selected.has(part)) ? group.workout_count : 0),
          0,
        )
      : matches.length === 1
        ? matches[0].workout_count
        : matches.length === day.body_parts?.length
          ? day.workout_count
          : null;
    return [
      {
        date: day.date,
        body_parts: matches,
        volume: matches.reduce((total, entry) => total + entry.volume, 0),
        set_count: matches.reduce((total, entry) => total + entry.set_count, 0),
        workout_count,
      },
    ];
  });
  return {
    ...activity,
    days,
    total_volume: days.reduce((total, day) => total + day.volume, 0),
    total_sets: days.reduce((total, day) => total + day.set_count, 0),
    workout_count: days.some((day) => day.workout_count === null)
      ? null
      : days.reduce((total, day) => total + (day.workout_count ?? 0), 0),
    active_days: days.length,
  };
}
