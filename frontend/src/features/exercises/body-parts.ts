import type { BodyPart, ExerciseOption } from "@/lib/api";

export const BODY_PART_LABELS: Record<BodyPart, string> = {
  chest: "胸",
  back: "背中",
  shoulders: "肩",
  arms: "腕",
  legs: "脚",
  glutes: "お尻",
  abs: "腹",
  full_body: "全身",
  other: "その他",
};
export const BODY_PARTS = Object.keys(BODY_PART_LABELS) as BodyPart[];
export type BodyPartFilter = BodyPart | "all" | "unclassified";
export const PART_FILTERS: { value: BodyPartFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  ...BODY_PARTS.map((value) => ({ value, label: BODY_PART_LABELS[value] })),
  { value: "unclassified", label: "未分類" },
];
export function filterExercises<
  T extends Pick<ExerciseOption, "name" | "primary_body_part" | "secondary_body_parts">,
>(options: T[], part: BodyPartFilter, query: string): T[] {
  return options.filter(
    (option) =>
      option.name.includes(query.trim()) &&
      (part === "all" ||
        (part === "unclassified"
          ? !option.primary_body_part
          : option.primary_body_part === part || option.secondary_body_parts?.includes(part))),
  );
}
export function groupExercises(options: ExerciseOption[]) {
  return [...BODY_PARTS, null]
    .map((part) => ({
      label: part ? BODY_PART_LABELS[part] : "未分類",
      options: options.filter((option) => (option.primary_body_part ?? null) === part),
    }))
    .filter((group) => group.options.length > 0);
}
