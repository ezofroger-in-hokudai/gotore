import { WombatBody } from "../branding/wombat";
import styles from "./loading-state.module.css";

export function LoadingState({
  label = "読み込み中",
  compact = false,
  startup = false,
}: { label?: string; compact?: boolean; startup?: boolean }) {
  if (!startup) {
    return (
      <output className="resource-status muted" aria-label={label}>
        読み込み中…
      </output>
    );
  }
  return (
    <output className={`${styles.loading} ${compact ? styles.compact : ""}`} aria-label={label}>
      <svg className={styles.mascot} viewBox="0 0 170 130" aria-hidden="true" focusable="false">
        <ellipse cx="85" cy="119" rx="39" ry="4" fill="currentColor" opacity="0.1" />
        <g stroke="#573e32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="70" cy="114" rx="12" ry="5" fill="#b49a83" />
          <ellipse cx="100" cy="114" rx="12" ry="5" fill="#b49a83" />
          <g className={styles.body}>
            <WombatBody />
          </g>
          <g className={styles.lift}>
            <path d="M62 88Q45 83 49 57M108 88Q125 83 121 57" fill="none" strokeWidth="13" />
            <path
              d="M62 88Q45 83 49 57M108 88Q125 83 121 57"
              fill="none"
              stroke="#b49a83"
              strokeWidth="8"
            />
            <path d="M33 51H137" stroke="#7d8992" strokeWidth="5" />
            <rect x="30" y="43" width="7" height="17" rx="2" fill="#71828c" />
            <rect x="37" y="37" width="9" height="29" rx="3" fill="#91a6ad" />
            <rect x="124" y="37" width="9" height="29" rx="3" fill="#91a6ad" />
            <rect x="133" y="43" width="7" height="17" rx="2" fill="#71828c" />
            <ellipse cx="51" cy="53" rx="6" ry="5" fill="#b49a83" />
            <ellipse cx="119" cy="53" rx="6" ry="5" fill="#b49a83" />
          </g>
        </g>
      </svg>
      <span aria-hidden="true">読み込み中…</span>
    </output>
  );
}
