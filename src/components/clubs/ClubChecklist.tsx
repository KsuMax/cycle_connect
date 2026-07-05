"use client";

import Link from "next/link";
import { CircleCheck, Circle } from "lucide-react";
import { useToast } from "@/lib/context/ToastContext";

interface ClubChecklistProps {
  clubId: string;
  clubName: string;
  clubSlug: string;
  routesCount: number;
  eventsCount: number;
  membersCount: number;
}

export function ClubChecklist({ clubId, clubName, clubSlug, routesCount, eventsCount, membersCount }: ClubChecklistProps) {
  const { showToast } = useToast();

  const routesDone = routesCount >= 3;
  const eventsDone = eventsCount >= 1;
  const membersDone = membersCount >= 2;

  if (routesDone && eventsDone && membersDone) return null;

  async function handleCopyInvite() {
    const text = `Наш велоклуб «${clubName}» теперь на CycleConnect — маршруты, заезды и отчёты в одном месте. Вступай: ${window.location.origin}/clubs/${clubSlug}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Приглашение скопировано — вставь в чат клуба", "success");
    } catch {
      showToast("Не удалось скопировать", "error");
    }
  }

  return (
    <div
      className="bg-white rounded-2xl border border-[#E4E4E7] p-5 mb-6"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
    >
      <h2 className="text-sm font-bold text-[#1C1C1E] mb-3">Чек-лист клуба</h2>
      <div className="space-y-3">
        <ChecklistItem
          done={routesDone}
          label="Добавь маршруты клуба"
          progress={`${Math.min(routesCount, 3)} из 3`}
          action={<Link href="/routes/new" className="text-xs font-semibold shrink-0" style={{ color: "#0BBFB5" }}>Добавить</Link>}
        />
        <ChecklistItem
          done={eventsDone}
          label="Создай первый заезд"
          action={<Link href={`/events/new?club=${clubId}`} className="text-xs font-semibold shrink-0" style={{ color: "#0BBFB5" }}>Создать</Link>}
        />
        <ChecklistItem
          done={membersDone}
          label="Пригласи участников"
          action={
            <button onClick={handleCopyInvite} className="text-xs font-semibold shrink-0" style={{ color: "#0BBFB5" }}>
              Скопировать приглашение
            </button>
          }
        />
      </div>
    </div>
  );
}

function ChecklistItem({
  done,
  label,
  progress,
  action,
}: {
  done: boolean;
  label: string;
  progress?: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {done ? (
        <CircleCheck size={18} className="shrink-0" style={{ color: "#0BBFB5" }} />
      ) : (
        <Circle size={18} className="shrink-0 text-[#D1D1D6]" />
      )}
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${done ? "line-through text-[#A1A1AA]" : "text-[#1C1C1E]"}`}>
          {label}
        </span>
        {progress && !done && (
          <span className="text-xs text-[#A1A1AA] ml-1.5">{progress}</span>
        )}
      </div>
      {!done && action}
    </div>
  );
}
