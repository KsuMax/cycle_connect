/**
 * Strava brand mark — the chevron / mountain shape.
 * Inlined SVG so it can be coloured via currentColor and live next to
 * text without the cost of an additional asset request.
 *
 * Brand colour is #FC4C02 — do not recolor this when used in a "Connect
 * with Strava" or "Powered by Strava" context per Strava brand guidelines.
 */

interface Props {
  size?: number;
  className?: string;
}

export function StravaLogo({ size = 16, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}
