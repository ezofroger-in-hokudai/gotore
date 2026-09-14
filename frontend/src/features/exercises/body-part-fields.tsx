"use client";

import type { BodyPart, BodyPartSelection, ExerciseOption } from "@/lib/api";
import { BODY_PARTS, BODY_PART_LABELS, optionParts } from "./body-parts";

export function BodyPartTags({ option }: { option?: Partial<ExerciseOption> }) {
  const { primary_body_part: primary, secondary_body_parts: secondary } = optionParts(option);
  return (
    <span className="body-part-tags">
      <span className="body-part-tag">{BODY_PART_LABELS[primary]}</span>
      {secondary.length > 0 && (
        <span className="body-part-secondary">
          補助：{secondary.map((part) => BODY_PART_LABELS[part]).join("・")}
        </span>
      )}
    </span>
  );
}

export function BodyPartFields({
  value,
  onChange,
}: {
  value: BodyPartSelection;
  onChange: (value: BodyPartSelection) => void;
}) {
  return (
    <div className="body-part-fields">
      <label>
        主な部位
        <select
          aria-label="主な部位"
          value={value.primary_body_part}
          onChange={(event) => {
            const primary = event.target.value as BodyPart;
            onChange({
              primary_body_part: primary,
              secondary_body_parts: value.secondary_body_parts.filter((part) => part !== primary),
            });
          }}
        >
          {BODY_PARTS.map((part) => (
            <option key={part} value={part}>
              {BODY_PART_LABELS[part]}
            </option>
          ))}
        </select>
      </label>
      <details className="secondary-parts">
        <summary>
          補助部位{" "}
          <small>
            任意
            {value.secondary_body_parts.length ? ` · ${value.secondary_body_parts.length}個` : ""}
          </small>
        </summary>
        <fieldset className="body-part-chips" aria-label="補助部位">
          {BODY_PARTS.filter((part) => part !== value.primary_body_part).map((part) => (
            <button
              key={part}
              type="button"
              aria-pressed={value.secondary_body_parts.includes(part)}
              onClick={() =>
                onChange({
                  ...value,
                  secondary_body_parts: BODY_PARTS.filter((item) =>
                    item === part
                      ? !value.secondary_body_parts.includes(item)
                      : value.secondary_body_parts.includes(item),
                  ),
                })
              }
            >
              {BODY_PART_LABELS[part]}
            </button>
          ))}
        </fieldset>
      </details>
    </div>
  );
}
