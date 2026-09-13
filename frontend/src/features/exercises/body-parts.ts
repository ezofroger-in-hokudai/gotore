import type { BodyPart, ExerciseOption } from "@/lib/api";

export const BODY_PART_LABELS: Record<BodyPart, string> = {
  chest: "胸",
  back: "背中",
  legs: "脚",
  arms: "腕",
  shoulders: "肩",
  abs: "腹筋",
  glutes: "お尻",
  other: "その他",
};
export const BODY_PARTS = Object.keys(BODY_PART_LABELS) as BodyPart[];
export type BodyPartFilter = BodyPart | "all";
export const PART_FILTERS: { value: BodyPartFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  ...BODY_PARTS.map((value) => ({ value, label: BODY_PART_LABELS[value] })),
];
export function normalizeBodyPart(part: ExerciseOption["primary_body_part"]): BodyPart {
  return part && part !== "full_body" ? part : "other";
}
export function optionParts(option?: Partial<ExerciseOption>) {
  const primary_body_part = normalizeBodyPart(option?.primary_body_part);
  return {
    primary_body_part,
    secondary_body_parts: BODY_PARTS.filter(
      (part) =>
        part !== primary_body_part &&
        option?.secondary_body_parts?.some((item) => normalizeBodyPart(item) === part),
    ),
  };
}
export function filterExercises<
  T extends Pick<ExerciseOption, "name" | "primary_body_part" | "secondary_body_parts">,
>(options: T[], part: BodyPartFilter, query: string): T[] {
  return options.filter(
    (option) =>
      option.name.includes(query.trim()) &&
      (part === "all" ||
        normalizeBodyPart(option.primary_body_part) === part ||
        option.secondary_body_parts?.some((item) => normalizeBodyPart(item) === part)),
  );
}
export function groupExercises(options: ExerciseOption[]) {
  return BODY_PARTS.map((part) => ({
    label: BODY_PART_LABELS[part],
    options: options.filter((option) => normalizeBodyPart(option.primary_body_part) === part),
  })).filter((group) => group.options.length > 0);
}
