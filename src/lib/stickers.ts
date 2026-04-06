// ─── User Sticker / Badge System ─────────────────────────────────────────────
//
// Stickers are small overlays shown on user avatars on profile pages.
// Each sticker has a priority — only the highest-priority sticker is shown.
//
// Priority (highest → lowest):
//   1. 👑 Admin           — is_admin = true
//   2. 🌟 Легенда         — km_total ≥ 3000 AND routes_count ≥ 10
//   3. 🗺️  Картограф      — routes_count ≥ 10
//   4. 💯 Стальные ноги   — km_total ≥ 1000
//   5. 🎪 Ивент-мастер    — events_count ≥ 15

export interface UserSticker {
  emoji: string;
  label: string;
  tooltip: string;
  /** CSS gradient or solid color for the badge background */
  bg: string;
}

interface ProfileStats {
  is_admin?: boolean;
  km_total: number;
  routes_count: number;
  events_count: number;
}

export function getUserSticker(profile: ProfileStats): UserSticker | null {
  if (profile.is_admin) {
    return {
      emoji: "👑",
      label: "Админ",
      tooltip: "Администратор сообщества",
      bg: "linear-gradient(135deg, #7C5CFC, #F4632A)",
    };
  }
  if (profile.km_total >= 3000 && profile.routes_count >= 10) {
    return {
      emoji: "🌟",
      label: "Легенда",
      tooltip: "Легенда сообщества: 3 000+ км и 10+ маршрутов",
      bg: "linear-gradient(135deg, #F59E0B, #EF4444)",
    };
  }
  if (profile.routes_count >= 10) {
    return {
      emoji: "🗺️",
      label: "Картограф",
      tooltip: "Опытный картограф: создал 10 и более маршрутов",
      bg: "linear-gradient(135deg, #0BBFB5, #06B6D4)",
    };
  }
  if (profile.km_total >= 1000) {
    return {
      emoji: "💯",
      label: "Стальные ноги",
      tooltip: "Стальные ноги: накатал 1 000+ км",
      bg: "linear-gradient(135deg, #F4632A, #F59E0B)",
    };
  }
  if (profile.events_count >= 15) {
    return {
      emoji: "🎪",
      label: "Ивент-мастер",
      tooltip: "Ивент-мастер: участвовал в 15+ мероприятиях",
      bg: "linear-gradient(135deg, #7C5CFC, #0BBFB5)",
    };
  }
  return null;
}
