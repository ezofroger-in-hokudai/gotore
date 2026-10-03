import type { ReactNode } from "react";

export function InlineEditTrigger({
  label,
  value,
  className = "",
  onClick,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`text-button inline-edit-trigger ${className}`.trim()}
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      <span className="inline-edit-value">{value}</span>
      <svg className="inline-edit-pencil" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 16.75V20h3.25L17.8 9.45l-3.25-3.25L4 16.75Zm16.3-9.8a.86.86 0 0 0 0-1.22l-2.03-2.03a.86.86 0 0 0-1.22 0l-1.6 1.6 3.25 3.25 1.6-1.6Z" />
      </svg>
    </button>
  );
}
