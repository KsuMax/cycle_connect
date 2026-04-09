"use client";

import { StravaLogo } from "./StravaLogo";

/**
 * "Connect with Strava" button.
 *
 * Submits a POST form to /api/strava/connect, which generates the OAuth
 * state nonce, sets the cookie, and 302-redirects to Strava's authorize
 * URL. We use a real form submission (not fetch) so the browser follows
 * the redirect for free and the user lands on Strava's domain — same UX
 * as a plain link, but with CSRF-resistant POST semantics on our side.
 *
 * Brand compliance: per Strava's brand guidelines (developers.strava.com/
 * guidelines), the official Connect button must use:
 *   - background colour #FC4C02 (or #FFFFFF on white-out variant)
 *   - the white Strava chevron mark
 *   - the literal copy "Connect with Strava"
 *   - sans-serif font, white text on the orange variant
 * We follow all of those. Hover state darkens to #E34302 which is the
 * documented "active" shade.
 */

interface Props {
  /** "compact" hides the helper subline beneath the button. */
  variant?: "default" | "compact";
  className?: string;
}

export function ConnectStravaButton({
  variant = "default",
  className = "",
}: Props) {
  return (
    <form action="/api/strava/connect" method="POST" className={className}>
      <button
        type="submit"
        className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl text-white font-semibold text-sm transition-colors w-full justify-center sm:w-auto"
        style={{ backgroundColor: "#FC4C02" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#E34302";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#FC4C02";
        }}
      >
        <StravaLogo size={18} />
        Connect with Strava
      </button>
      {variant === "default" && (
        <p className="text-[11px] text-[#A1A1AA] mt-2 leading-relaxed">
          Подключи Strava — мы автоматически подсчитаем твои километры
          и покажем заезды в профиле. Ты ничего не вводишь руками.
        </p>
      )}
    </form>
  );
}
