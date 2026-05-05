"use client";

import Link from "next/link";
import { Camera, FileText, Send, ChevronDown, ChevronUp, Check } from "lucide-react";

interface SetupChecklistProps {
  hasBio: boolean;
  hasAvatar: boolean;
  hasTelegram: boolean;
  onUploadAvatar: () => void;
}

export function SetupChecklist({ hasBio, hasAvatar, hasTelegram, onUploadAvatar }: SetupChecklistProps) {
  const items = [
    {
      done: hasAvatar,
      icon: <Camera size={14} />,
      label: "Фото профиля",
      action: (
        <button
          onClick={onUploadAvatar}
          className="text-xs font-medium text-[#7C5CFC] hover:underline whitespace-nowrap"
        >
          Добавить
        </button>
      ),
    },
    {
      done: hasBio,
      icon: <FileText size={14} />,
      label: "О себе",
      action: (
        <Link href="/profile/settings" className="text-xs font-medium text-[#7C5CFC] hover:underline whitespace-nowrap">
          Заполнить
        </Link>
      ),
    },
    {
      done: hasTelegram,
      icon: <Send size={14} />,
      label: "Telegram-бот",
      action: (
        <Link href="/profile/settings" className="text-xs font-medium text-[#0088CC] hover:underline whitespace-nowrap">
          Подключить
        </Link>
      ),
    },
  ];

  const doneCount = items.filter((i) => i.done).length;

  if (doneCount === items.length) return null;

  return (
    <div
      className="rounded-2xl border border-[#E4E4E7] bg-white mb-6 overflow-hidden"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F4F4F5]">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-[#1C1C1E]">Настройка профиля</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#F5F4F1] text-[#71717A]">
            {doneCount}/{items.length}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 w-20 rounded-full bg-[#E4E4E7] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(doneCount / items.length) * 100}%`,
              background: "linear-gradient(90deg, #F4632A, #7C5CFC)",
            }}
          />
        </div>
      </div>

      {/* Items */}
      <ul className="divide-y divide-[#F4F4F5]">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-3 px-5 py-3">
            {/* Checkbox */}
            <div
              className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
              style={
                item.done
                  ? { borderColor: "#22C55E", backgroundColor: "#22C55E" }
                  : { borderColor: "#D4D4D8", backgroundColor: "transparent" }
              }
            >
              {item.done && <Check size={11} className="text-white" strokeWidth={3} />}
            </div>
            {/* Icon + label */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span style={{ color: item.done ? "#A1A1AA" : "#71717A" }}>{item.icon}</span>
              <span
                className="text-sm truncate"
                style={{ color: item.done ? "#A1A1AA" : "#1C1C1E" }}
              >
                {item.label}
              </span>
            </div>
            {/* Action */}
            {!item.done && item.action}
          </li>
        ))}
      </ul>
    </div>
  );
}
