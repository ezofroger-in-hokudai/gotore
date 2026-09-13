import styles from "./loading-state.module.css";

export function LoadingState({
  label = "読み込み中",
  compact = false,
}: { label?: string; compact?: boolean }) {
  return (
    <output className={`${styles.loading} ${compact ? styles.compact : ""}`} aria-label={label}>
      <svg className={styles.mascot} viewBox="0 0 170 130" aria-hidden="true" focusable="false">
        <ellipse cx="85" cy="119" rx="39" ry="4" fill="currentColor" opacity="0.1" />
        <g stroke="#573e32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="70" cy="114" rx="12" ry="5" fill="#f3d1b1" />
          <ellipse cx="100" cy="114" rx="12" ry="5" fill="#f3d1b1" />
          <g className={styles.body}>
            <ellipse cx="85" cy="86" rx="28" ry="29" fill="#ffe6c5" />
            <ellipse cx="85" cy="93" rx="17" ry="18" fill="#fff9ef" stroke="none" />
            <circle cx="64" cy="44" r="10" fill="#ffe6c5" />
            <circle cx="106" cy="44" r="10" fill="#ffe6c5" />
            <circle cx="64" cy="44" r="5" fill="#efb1a0" stroke="none" />
            <circle cx="106" cy="44" r="5" fill="#efb1a0" stroke="none" />
            <path d="M60 58C60 32 110 32 110 58L114 73C115 96 55 96 56 73Z" fill="#ffe6c5" />
            <ellipse cx="85" cy="75" rx="21" ry="14" fill="#fff9ef" stroke="none" />
            <path d="M60 53Q85 46 110 53L110 59Q85 52 60 59Z" fill="#d32f2f" stroke="none" />
            <path d="M110 55L120 50L119 61Z" fill="#d32f2f" stroke="none" />
            <path d="M75 66L75 69M95 66L95 69" strokeWidth="3.5" />
            <ellipse cx="67" cy="74" rx="5" ry="3" fill="#edac97" stroke="none" />
            <ellipse cx="103" cy="74" rx="5" ry="3" fill="#edac97" stroke="none" />
            <path d="M82 73Q85 71 88 73L85 76Z" fill="#573e32" stroke="none" />
            <path d="M79 79Q82 82 85 78Q88 82 91 79" fill="none" strokeWidth="1.8" />
          </g>
          <g className={styles.lift}>
            <path d="M62 88Q45 83 49 57M108 88Q125 83 121 57" fill="none" strokeWidth="13" />
            <path
              d="M62 88Q45 83 49 57M108 88Q125 83 121 57"
              fill="none"
              stroke="#ffe6c5"
              strokeWidth="8"
            />
            <path d="M33 51H137" stroke="#7d8992" strokeWidth="5" />
            <rect x="30" y="43" width="7" height="17" rx="2" fill="#71828c" />
            <rect x="37" y="37" width="9" height="29" rx="3" fill="#91a6ad" />
            <rect x="124" y="37" width="9" height="29" rx="3" fill="#91a6ad" />
            <rect x="133" y="43" width="7" height="17" rx="2" fill="#71828c" />
            <ellipse cx="51" cy="53" rx="6" ry="5" fill="#ffe6c5" />
            <ellipse cx="119" cy="53" rx="6" ry="5" fill="#ffe6c5" />
          </g>
        </g>
      </svg>
      <span aria-hidden="true">読み込み中…</span>
    </output>
  );
}
