/**
 * HOKI Logo — 圓形朱紅福字印章
 * 福 = HOKI 的台語讀音，書法印章感呼應台灣傳統美學
 */
interface LogoProps {
  className?: string;
  size?: number;
}

export default function Logo({ className = '', size = 36 }: LogoProps) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      alt="HOKI"
      className={className}
      decoding="async"
      loading="eager"
    />
  );
}
