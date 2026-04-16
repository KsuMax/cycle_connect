"use client";

import { Send, Mail } from "lucide-react";
import type { User } from "@/types";

/**
 * Deep-link to the user's Telegram DM.
 *
 * `tg://resolve` opens the native app when installed. Browsers that don't
 * handle the scheme stay on the page, so we always render a regular https
 * link — clicking on desktop web goes to t.me, clicking on mobile with TG
 * installed jumps straight to the app.
 */
export function buildTelegramUrl(username: string): string {
  return `https://t.me/${username}`;
}

interface ContactButtonProps {
  user: Pick<User, "telegram_username" | "contact_email" | "name">;
  /** "icon" = 28px square, "inline" = icon + "Написать" text. */
  variant?: "icon" | "inline";
  /** Stop link click from bubbling up to a parent <Link> / <a>. */
  stopPropagation?: boolean;
}

export function ContactButton({ user, variant = "icon", stopPropagation = true }: ContactButtonProps) {
  const tg = user.telegram_username?.trim() || null;
  const email = user.contact_email?.trim() || null;

  // Nothing public — show nothing. (Caller decides whether to render a hint.)
  if (!tg && !email) return null;

  const onClick = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
  };

  if (tg) {
    const href = buildTelegramUrl(tg);
    if (variant === "inline") {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          style={{ backgroundColor: "#E6F4FB", color: "#0088CC" }}
          title={`Написать ${user.name} в Telegram`}
          aria-label={`Написать ${user.name} в Telegram`}
        >
          <Send size={12} /> Написать
        </a>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0"
        style={{ backgroundColor: "#E6F4FB", color: "#0088CC" }}
        title={`Написать ${user.name} в Telegram`}
        aria-label={`Написать ${user.name} в Telegram`}
      >
        <Send size={13} />
      </a>
    );
  }

  // Email fallback
  const href = `mailto:${email}`;
  if (variant === "inline") {
    return (
      <a
        href={href}
        onClick={onClick}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        style={{ backgroundColor: "#F5F4F1", color: "#3F3F46" }}
        title={`Написать ${user.name} на e-mail`}
        aria-label={`Написать ${user.name} на e-mail`}
      >
        <Mail size={12} /> Написать
      </a>
    );
  }
  return (
    <a
      href={href}
      onClick={onClick}
      className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0"
      style={{ backgroundColor: "#F5F4F1", color: "#3F3F46" }}
      title={`Написать ${user.name} на e-mail`}
      aria-label={`Написать ${user.name} на e-mail`}
    >
      <Mail size={13} />
    </a>
  );
}

/** True if the user has any public contact method. */
export function hasPublicContact(user: Pick<User, "telegram_username" | "contact_email">): boolean {
  return !!(user.telegram_username?.trim() || user.contact_email?.trim());
}
