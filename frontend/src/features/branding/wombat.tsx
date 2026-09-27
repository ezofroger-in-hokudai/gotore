export function WombatBody() {
  return (
    <g stroke="#573e32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M57 78Q49 104 65 114H105Q121 101 113 79Z" fill="#a98d78" />
      <ellipse cx="85" cy="96" rx="19" ry="19" fill="#c7ae95" stroke="none" />
      <path d="M59 54Q49 29 63 30Q76 34 74 51M96 51Q93 31 107 30Q121 29 111 55" fill="#a98d78" />
      <path d="M61 45L62 37M106 45L106 37" stroke="#d3b59e" strokeWidth="5" />
      <path d="M55 66Q52 42 85 43Q118 42 115 66Q121 92 85 93Q49 92 55 66Z" fill="#b49a83" />
      <ellipse cx="85" cy="76" rx="20" ry="14" fill="#d7c3aa" stroke="none" />
      <path d="M57 54Q85 47 113 54L113 60Q85 54 57 60Z" fill="#d32f2f" stroke="none" />
      <path d="M112 55L123 51L121 62Z" fill="#d32f2f" stroke="none" />
      <path d="M70 66V68M100 66V68" strokeWidth="3.5" />
      <path d="M76 70Q85 66 94 70L93 77Q85 82 77 77Z" fill="#573e32" stroke="none" />
      <path d="M80 83Q85 86 90 83" fill="none" strokeWidth="1.8" />
      <ellipse cx="65" cy="76" rx="4" ry="2.5" fill="#d5a591" stroke="none" />
      <ellipse cx="105" cy="76" rx="4" ry="2.5" fill="#d5a591" stroke="none" />
    </g>
  );
}

export function WombatBarbell({
  className,
  bodyClassName,
  liftClassName,
}: { className?: string; bodyClassName?: string; liftClassName?: string }) {
  return (
    <svg className={className} viewBox="0 0 170 130" aria-hidden="true" focusable="false">
      <ellipse cx="85" cy="119" rx="39" ry="4" fill="currentColor" opacity="0.1" />
      <g stroke="#573e32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="70" cy="114" rx="12" ry="5" fill="#b49a83" />
        <ellipse cx="100" cy="114" rx="12" ry="5" fill="#b49a83" />
        <g className={bodyClassName}>
          <WombatBody />
        </g>
        <g className={liftClassName}>
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
  );
}
