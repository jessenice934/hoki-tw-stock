import { useId } from 'react';

/**
 * HOKI Logo — hanko-style ink stamp
 * 朱紅方印（vermilion seal） + 白色 H + 金箔點
 * 取意：印章為信用、信物；福氣由你掌舵
 */
interface LogoProps {
  className?: string;
  size?: number;
}

export default function Logo({ className = '', size = 36 }: LogoProps) {
  const uid = useId();
  const inkId = `hokiInk-${uid}`;
  const grainId = `hokiPaperGrain-${uid}`;
  return (
    <svg
      viewBox="0 0 36 36"
      width={size}
      height={size}
      className={className}
      aria-label="HOKI"
      role="img"
    >
      <defs>
        <radialGradient id={grainId} cx="30%" cy="25%" r="80%">
          <stop offset="0%" stopColor="#FFF8EC" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#C8553D" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={inkId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#D85F47" />
          <stop offset="100%" stopColor="#A8412A" />
        </linearGradient>
      </defs>

      {/* hanko square */}
      <rect width="36" height="36" rx="9" fill={`url(#${inkId})`} />
      <rect width="36" height="36" rx="9" fill={`url(#${grainId})`} />
      {/* subtle inner ring (印泥邊) */}
      <rect
        x="1.5"
        y="1.5"
        width="33"
        height="33"
        rx="7.5"
        fill="none"
        stroke="rgba(250, 246, 238, 0.18)"
        strokeWidth="1"
      />

      {/* H mark — 兩柱 + 一橫，刻意微縮提供呼吸 */}
      <path
        d="M11.5 9.5 V26.5 M24.5 9.5 V26.5 M11.5 18 H24.5"
        stroke="#FAF6EE"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 金箔點 — 右上角的福氣火種 */}
      <circle cx="28.5" cy="7.5" r="1.8" fill="#E0C480" />
      <circle cx="28.5" cy="7.5" r="0.8" fill="#FAF6EE" opacity="0.7" />
    </svg>
  );
}
