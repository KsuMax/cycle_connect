"use client";

import Link from "next/link";
import { Send } from "lucide-react";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { type DbRouteInterest, type DbProfile, type RoughWhen } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { formatDate } from "@/lib/utils";

interface RouteInterestSectionProps {
  interests: DbRouteInterest[];
}

const ROUGH_LABELS: Record<RoughWhen, string> = {
  anytime: "когда угодно",
  weekend: "на выходных",
  this_month: "в этом месяце",
  specific: "конкретная дата",
};

function profileToUser(p: DbProfile) {
  const name = p.name ?? "Катальщик";
  return {
    id: p.id,
    name,
    initials: name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    color: "#0BBFB5",
    avatar_url: p.avatar_url ?? null,
    km_total: 0,
    routes_count: 0,
    events_count: 0,
  };
}

function describeWhen(planned: string | null, rough: RoughWhen | null): string {
  if (rough === "specific" && planned) return formatDate(planned);
  if (rough && rough !== "specific") return ROUGH_LABELS[rough];
  if (planned) return formatDate(planned);
  return "когда получится";
}

// Социальный блок «Хотят проехать» — сама отметка интереса теперь делается
// через кнопку «Сохранить» на карточке маршрута (см. RoutePageClient.handleFavorite).
// Секция только показывает пул желающих; собственной кнопки добавления/редактирования нет.
export function RouteInterestSection({ interests }: RouteInterestSectionProps) {
  const { user } = useAuth();

  const myInterest = user ? interests.find(i => i.user_id === user.id) ?? null : null;
  const others = interests.filter(i => i.user_id !== user?.id);
  const today = new Date().toISOString().split("T")[0];

  const poolUsers = interests
    .map(i => i.profile)
    .filter((p): p is DbProfile => !!p)
    .map(profileToUser);

  const total = interests.length;

  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-[#1C1C1E]">Хотят проехать</h3>
        <p className="text-xs text-[#A1A1AA] mt-0.5">
          {myInterest
            ? "Ты в списке. Активируй tg-бот в профиле, чтобы получать уведомления о попутчиках."
            : total > 0
            ? "Сохрани маршрут — попадёшь в список желающих и найдёшь попутчиков. Активируй tg-бот в профиле, чтобы получать уведомления."
            : "Пока никто не собирается — сохрани маршрут первым."}
        </p>
      </div>

      {/* Pool */}
      {total > 0 && (
        <div className="flex items-center justify-between mb-3 p-2.5 rounded-xl bg-[#F8F8F6]">
          <AvatarGroup users={poolUsers} max={6} getHref={(u) => `/users/${u.id}`} />
          <span className="text-xs text-[#71717A] font-medium">
            {total === 1
              ? "1 человек"
              : total < 5
              ? `${total} человека`
              : `${total} человек`}
          </span>
        </div>
      )}

      {/* Others' details (only when there are concrete dates / notes) */}
      {others.some(i => i.planned_date || i.rough_when || i.note) && (
        <div className="space-y-1.5">
          {others
            .filter(i => i.planned_date || i.rough_when || i.note)
            .slice(0, 4)
            .map(i => (
              <OtherInterestRow key={i.user_id} interest={i} today={today} />
            ))}
        </div>
      )}
    </div>
  );
}

function OtherInterestRow({ interest, today }: { interest: DbRouteInterest; today: string }) {
  const profile = interest.profile;
  if (!profile) return null;
  const name = profile.name ?? "Катальщик";
  const tg = profile.telegram_username;
  const when = describeWhen(interest.planned_date, interest.rough_when);
  const isPast = interest.planned_date && interest.planned_date < today;

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <Link href={`/users/${profile.id}`}>
        <Avatar user={profileToUser(profile)} size="sm" />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link href={`/users/${profile.id}`} className="text-sm font-medium text-[#1C1C1E] hover:text-[#F4632A] transition-colors truncate">
            {name}
          </Link>
          <span className={`text-xs ${isPast ? "text-[#A1A1AA] line-through" : "text-[#71717A]"}`}>
            {when}
          </span>
        </div>
        {interest.note && (
          <div className="text-xs text-[#A1A1AA] truncate">{interest.note}</div>
        )}
      </div>
      {tg && (
        <a
          href={`https://t.me/${tg}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Написать @${tg} в Telegram`}
          className="flex items-center gap-1 text-xs font-medium text-[#0088CC] hover:text-[#006DAF] transition-colors px-2 py-1 rounded-lg hover:bg-[#E8F5FB]"
        >
          <Send size={11} />
        </a>
      )}
    </div>
  );
}
