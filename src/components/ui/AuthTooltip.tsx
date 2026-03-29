"use client";

interface AuthTooltipProps {
  children: React.ReactNode;
  disabled: boolean;
  className?: string;
}

/**
 * Wraps a button/link. When disabled (user not logged in):
 * - dims the child with opacity-50
 * - overlays a transparent cursor-not-allowed div to block clicks
 * - shows "Сначала авторизуйся" tooltip on hover
 *
 * When not disabled: renders children as-is (no wrapper).
 */
export function AuthTooltip({ children, disabled, className }: AuthTooltipProps) {
  if (!disabled) return <>{children}</>;

  return (
    <div className={`relative group ${className ?? ""}`}>
      {/* Dim + block pointer events on children */}
      <div className="opacity-50 pointer-events-none select-none">{children}</div>

      {/* Transparent click blocker */}
      <div className="absolute inset-0 cursor-not-allowed z-10" />

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[#1C1C1E] text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
        Сначала авторизуйся
        {/* Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1C1C1E]" />
      </div>
    </div>
  );
}
