interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
}

/** Full logo: rounded rect border + two bicycle wheels + handlebar + saddle */
export function Logo({ width = 270, height = 165, className }: LogoProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 270 165"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Rounded border */}
      <rect x="2" y="2" width="266" height="161" rx="21" stroke="#111111" strokeWidth="3" fill="white" />

      {/* Speed lines — left of left wheel */}
      <line x1="8" y1="72" x2="28" y2="72" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="8" y1="84" x2="28" y2="84" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" />

      {/* Handlebar — above left wheel */}
      <line x1="66" y1="22" x2="110" y2="22" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" />

      {/* Saddle — above right wheel (arc curving right, like ")") */}
      <path d="M 171,22 A 10,10 0 0,1 171,42" stroke="#111111" strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* Left wheel */}
      <circle cx="88" cy="85" r="52" stroke="#111111" strokeWidth="3" />
      <circle cx="88" cy="85" r="4.5" fill="#111111" />

      {/* Right wheel */}
      <circle cx="182" cy="85" r="52" stroke="#111111" strokeWidth="3" />
      <circle cx="182" cy="85" r="4.5" fill="#111111" />
    </svg>
  );
}

/** Compact wheel mark — for use in the header navbar */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  // viewBox: 200 x 120
  return (
    <svg
      width={size * (200 / 120)}
      height={size}
      viewBox="0 0 200 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Speed lines */}
      <line x1="2" y1="62" x2="14" y2="62" stroke="#111111" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="74" x2="14" y2="74" stroke="#111111" strokeWidth="2" strokeLinecap="round" />

      {/* Handlebar above left wheel */}
      <line x1="42" y1="18" x2="76" y2="18" stroke="#111111" strokeWidth="2" strokeLinecap="round" />

      {/* Saddle above right wheel — arc like ")" */}
      <path d="M 137,18 A 8,8 0 0,1 137,34" stroke="#111111" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* Left wheel */}
      <circle cx="59" cy="73" r="44" stroke="#111111" strokeWidth="2.5" />
      <circle cx="59" cy="73" r="3.5" fill="#111111" />

      {/* Right wheel */}
      <circle cx="149" cy="73" r="44" stroke="#111111" strokeWidth="2.5" />
      <circle cx="149" cy="73" r="3.5" fill="#111111" />
    </svg>
  );
}
