import type { BodyPart } from "@/lib/api";
import { PART_FILTERS } from "../exercises/body-parts";

export function GroupHistoryPartTabs({
  part,
  onChange,
  disabled = false,
}: {
  part: BodyPart | "all";
  onChange: (part: BodyPart | "all") => void;
  disabled?: boolean;
}) {
  return (
    <div className="personal-history-part-tabs" aria-label="部位で絞り込み">
      {PART_FILTERS.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={part === item.value}
          disabled={disabled && item.value !== "all"}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
