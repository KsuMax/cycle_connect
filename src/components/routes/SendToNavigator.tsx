"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Download, QrCode, Share2, Smartphone, X } from "lucide-react";
import { ymGoal } from "@/lib/ym";

const LAST_TARGET_KEY = "cc_export_target";

interface Guide {
  id: string;
  title: string;
  steps: string[];
}

const GUIDES: Guide[] = [
  {
    id: "garmin",
    title: "Garmin",
    steps: [
      "На телефоне нажми «Отправить в приложение» и выбери Garmin Connect (или скачай GPX и открой его через «Поделиться»).",
      "В Garmin Connect сохрани маршрут как «Дистанцию» (курс).",
      "Нажми «Отправить на устройство» — курс синхронизируется на велокомпьютер или часы.",
    ],
  },
  {
    id: "karoo",
    title: "Hammerhead Karoo",
    steps: [
      "Скачай GPX-файл.",
      "Зайди на dashboard.hammerhead.io → Routes → New Route → Import.",
      "Загрузи файл — после синхронизации маршрут появится на Karoo.",
    ],
  },
  {
    id: "wahoo",
    title: "Wahoo ELEMNT",
    steps: [
      "На телефоне нажми «Отправить в приложение» и выбери приложение ELEMNT.",
      "Маршрут появится в приложении и синхронизируется на велокомпьютер.",
    ],
  },
  {
    id: "other",
    title: "Другой велокомпьютер (iGPSPORT, Bryton, Magene…)",
    steps: [
      "Скачай GPX-файл.",
      "Импортируй его через фирменное приложение велокомпьютера или скопируй на устройство по USB.",
    ],
  },
];

/**
 * «Отправить на навигатор»: share sheet с GPX-файлом (мобайл), скачивание,
 * QR для переброски маршрута с десктопа на телефон и инструкции под
 * конкретные велокомпьютеры. Цель Метрики route_export замеряет спрос
 * по каналам перед мобильным приложением.
 */
export function SendToNavigator({ routeId, routeTitle }: { routeId: string; routeTitle: string }) {
  const [open, setOpen] = useState(false);
  // Ленивые инициализаторы вместо эффекта: при первом рендере шит закрыт,
  // поэтому расхождения с SSR-разметкой не возникает.
  const [canShareFiles] = useState(() => {
    if (typeof navigator === "undefined") return false;
    try {
      const probe = new File(["<gpx/>"], "probe.gpx", { type: "application/gpx+xml" });
      return !!navigator.canShare?.({ files: [probe] });
    } catch {
      return false;
    }
  });
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [lastTarget, setLastTarget] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(LAST_TARGET_KEY);
    } catch {
      return null;
    }
  });
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  const exportUrl = `/api/routes/${routeId}/export`;

  useEffect(() => {
    // Открытие по QR-ссылке с десктопа: /routes/[id]?send=1.
    // В ленивый инициализатор не вынести: сервер рендерит шит закрытым,
    // и open=true на первом клиентском рендере дал бы hydration mismatch.
    if (new URLSearchParams(window.location.search).has("send")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  function track(target: string) {
    ymGoal("route_export", { target, route_id: routeId });
    try {
      localStorage.setItem(LAST_TARGET_KEY, target);
    } catch {}
    setLastTarget(target);
  }

  async function shareToApp() {
    setSharing(true);
    setShareError(false);
    try {
      const res = await fetch(exportUrl);
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const file = new File([blob], `${routeTitle}.gpx`, { type: "application/gpx+xml" });
      await navigator.share({ files: [file], title: routeTitle });
      track("share_sheet");
    } catch (e) {
      // AbortError — пользователь закрыл системное меню, это не ошибка
      if (!(e instanceof DOMException && e.name === "AbortError")) setShareError(true);
    } finally {
      setSharing(false);
    }
  }

  async function toggleQr() {
    if (qrDataUrl) {
      setQrDataUrl(null);
      return;
    }
    const { toDataURL } = await import("qrcode");
    const url = `${window.location.origin}/routes/${routeId}?send=1`;
    setQrDataUrl(
      await toDataURL(url, { width: 220, margin: 1, color: { dark: "#1C1C1E", light: "#FFFFFF" } }),
    );
    track("qr");
  }

  const recentChip = (
    <span className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: "#E6FAF9", color: "#0BBFB5" }}>
      недавно
    </span>
  );

  const rowClass =
    "flex w-full items-center gap-3 rounded-xl border border-[#E4E4E7] p-3 text-left transition-colors hover:border-[#0BBFB5] hover:bg-[#F8FFFE]";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: "#0BBFB5" }}
      >
        <Share2 size={13} /> Отправить на навигатор
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-md sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Отправить маршрут на навигатор"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-[#1C1C1E]">Отправить на навигатор</h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-[#71717A] transition-colors hover:bg-[#F5F4F1] hover:text-[#1C1C1E]"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              {canShareFiles && (
                <button onClick={shareToApp} disabled={sharing} className={rowClass}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: "#E6FAF9", color: "#0BBFB5" }}>
                    <Smartphone size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[#1C1C1E]">
                      {sharing ? "Готовлю файл…" : "Отправить в приложение"}
                    </span>
                    <span className="block text-xs text-[#71717A]">
                      Garmin Connect, Komoot, OsmAnd — через меню «Поделиться»
                    </span>
                  </span>
                  {lastTarget === "share_sheet" && recentChip}
                </button>
              )}

              <a href={exportUrl} download onClick={() => track("download")} className={rowClass}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "#FFF7ED", color: "#F4632A" }}>
                  <Download size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[#1C1C1E]">Скачать GPX-файл</span>
                  <span className="block text-xs text-[#71717A]">
                    Для импорта вручную — Karoo, Wahoo, USB
                  </span>
                </span>
                {lastTarget === "download" && recentChip}
              </a>

              {!canShareFiles && (
                <button onClick={toggleQr} className={rowClass}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: "#F5F3FF", color: "#7C3AED" }}>
                    <QrCode size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[#1C1C1E]">QR-код для телефона</span>
                    <span className="block text-xs text-[#71717A]">
                      Отсканируй камерой — маршрут откроется на телефоне
                    </span>
                  </span>
                  {lastTarget === "qr" && recentChip}
                </button>
              )}

              {qrDataUrl && (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-[#E4E4E7] p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR-код маршрута" width={180} height={180} />
                  <p className="text-center text-xs text-[#71717A]">
                    На телефоне откроется эта страница — дальше «Отправить в приложение»
                  </p>
                </div>
              )}

              {shareError && (
                <p className="rounded-xl px-3 py-2 text-xs" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
                  Не получилось подготовить файл. Попробуй «Скачать GPX-файл».
                </p>
              )}
            </div>

            <div className="mt-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#71717A]">
                Как отправить на велокомпьютер
              </p>
              <div className="divide-y divide-[#F5F4F1] rounded-xl border border-[#E4E4E7]">
                {GUIDES.map((g) => (
                  <div key={g.id}>
                    <button
                      onClick={() => setOpenGuide(openGuide === g.id ? null : g.id)}
                      className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm font-medium text-[#1C1C1E]"
                    >
                      {g.title}
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-[#71717A] transition-transform ${openGuide === g.id ? "rotate-180" : ""}`}
                      />
                    </button>
                    {openGuide === g.id && (
                      <ol className="list-decimal space-y-1.5 px-3 pb-3 pl-8 text-xs leading-relaxed text-[#3F3F46]">
                        {g.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
