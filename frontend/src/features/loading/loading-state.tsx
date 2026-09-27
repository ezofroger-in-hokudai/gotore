import { WombatBarbell } from "../branding/wombat";
import styles from "./loading-state.module.css";

export function LoadingState({
  label = "読み込み中",
  compact = false,
  startup = false,
}: { label?: string; compact?: boolean; startup?: boolean }) {
  if (!startup) {
    return (
      <output
        className={`resource-status ${styles.progress}${compact ? ` ${styles.inline}` : ""}`}
        aria-label={label}
      >
        <span className={styles.spinner} aria-hidden="true" />
      </output>
    );
  }
  return (
    <output className={`${styles.loading} ${compact ? styles.compact : ""}`} aria-label={label}>
      <WombatBarbell
        className={styles.mascot}
        bodyClassName={styles.body}
        liftClassName={styles.lift}
      />
    </output>
  );
}
