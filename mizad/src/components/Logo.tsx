// Mazad Boss logo: the gold gavel in aviator sunglasses, black suit, white shirt and gold tie.
export default function Logo({ size = 40, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="20 8 160 192" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ display: 'block', flexShrink: 0 }}>
      <path d="M46 198 L54 124 Q60 102 84 98 L116 98 Q140 102 146 124 L154 198 Z" fill="#111111" stroke="#4a4943" strokeWidth="2.5" />
      <path d="M84 98 L100 154 L116 98 Z" fill="#ffffff" />
      <path d="M95 101 L105 101 L103 110 L97 110 Z" fill="#d7b77f" />
      <path d="M97 110 L103 110 L108 142 L100 154 L92 142 Z" fill="#c9a25a" />
      <rect x="90" y="128" width="20" height="4" rx="2" fill="#f2e2bf" />
      <path d="M84 98 L94 138 L74 124 L83 110 Z" fill="#262624" />
      <path d="M116 98 L106 138 L126 124 L117 110 Z" fill="#262624" />
      <circle cx="64" cy="186" r="4" fill="#d7b77f" />
      <circle cx="136" cy="186" r="4" fill="#d7b77f" />
      <rect x="92" y="80" width="16" height="22" rx="3" fill="#a77b3c" />
      <g transform="rotate(-10 100 52)">
        <rect x="28" y="20" width="144" height="62" rx="16" fill="#d7b77f" />
        <rect x="28" y="20" width="20" height="62" rx="9" fill="#a77b3c" />
        <rect x="152" y="20" width="20" height="62" rx="9" fill="#a77b3c" />
        <rect x="56" y="26" width="88" height="5" rx="2.5" fill="#ecd6a8" />
        <path d="M56 40 Q76 36 96 40 Q96 62 78 64 Q58 64 56 40 Z" fill="#111111" stroke="#f2e2bf" strokeWidth="2.5" />
        <path d="M104 40 Q124 36 144 40 Q142 64 122 64 Q104 62 104 40 Z" fill="#111111" stroke="#f2e2bf" strokeWidth="2.5" />
        <path d="M96 42 Q100 38 104 42" fill="none" stroke="#f2e2bf" strokeWidth="2.5" />
        <path d="M63 46 L71 45" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity=".85" />
        <path d="M111 46 L119 45" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity=".85" />
        <path d={size < 60 ? 'M84 71 Q100 80 118 67' : 'M86 72 Q100 78 116 68'} fill="none" stroke="#6b4a1c" strokeWidth={size < 60 ? 5 : 3} strokeLinecap="round" />
      </g>
    </svg>
  )
}
