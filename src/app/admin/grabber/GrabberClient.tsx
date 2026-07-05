"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";

interface CandidateLink {
  url: string;
  type: string;
  resolvedUrl?: string;
}

export interface GrabberCandidate {
  id: string;
  permalink: string;
  title: string | null;
  region: string | null;
  summary: string | null;
  links: CandidateLink[];
  confidence: number;
  raw_snippet: string | null;
  status: string;
  created_at: string;
  source: { label: string | null; type: string } | { label: string | null; type: string }[] | null;
}

export interface GrabberSourceRow {
  id: string;
  type: "telegram-preview" | "ips-forum";
  identifier: string;
  label: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_error: string | null;
}

const LINK_LABELS: Record<string, string> = {
  nakarte: "Nakarte",
  strava: "Strava",
  komoot: "Komoot",
  wikiloc: "Wikiloc",
  osm: "OSM",
  mapmagic: "MapMagic",
  gpx: "GPX",
  "forum-attachment": "вложение",
  unknown: "неизвестно",
};

const TYPE_LABELS: Record<GrabberSourceRow["type"], string> = {
  "telegram-preview": "Telegram",
  "ips-forum": "Форум",
};

function sourceLabel(source: GrabberCandidate["source"]): string {
  const s = Array.isArray(source) ? source[0] : source;
  return s?.label ?? "Источник";
}

function formatLastRun(iso: string | null): string {
  if (!iso) return "ещё не проверялся";
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function GrabberClient({
  initialCandidates,
  initialSources,
}: {
  initialCandidates: GrabberCandidate[];
  initialSources: GrabberSourceRow[];
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [sources, setSources] = useState(initialSources);
  useEffect(() => setCandidates(initialCandidates), [initialCandidates]);
  useEffect(() => setSources(initialSources), [initialSources]);

  const [pending, setPending] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, string>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState<GrabberSourceRow["type"]>("telegram-preview");
  const [newIdentifier, setNewIdentifier] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  const updateStatus = async (id: string, status: "rejected" | "imported") => {
    setPending(id);
    try {
      const res = await fetch(`/api/admin/grabber/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setCandidates((prev) => prev.filter((c) => c.id !== id));
      }
    } finally {
      setPending(null);
    }
  };

  const handleImport = async (candidate: GrabberCandidate) => {
    const mapmagicLink = candidate.links.find((l) => l.type === "mapmagic");
    const params = new URLSearchParams();
    if (candidate.title) params.set("title", candidate.title);
    if (candidate.region) params.set("region", candidate.region);

    const descriptionParts = [candidate.summary, `Источник: ${candidate.permalink}`].filter(Boolean);
    params.set("description", descriptionParts.join("\n\n"));

    if (mapmagicLink) {
      params.set("mapUrl", mapmagicLink.resolvedUrl ?? mapmagicLink.url);
    }

    await updateStatus(candidate.id, "imported");
    router.push(`/routes/new?${params.toString()}`);
  };

  const handleRunSource = async (source: GrabberSourceRow) => {
    setRunningId(source.id);
    setRunResults((prev) => ({ ...prev, [source.id]: "" }));
    try {
      const res = await fetch(`/api/admin/grabber/sources/${source.id}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRunResults((prev) => ({ ...prev, [source.id]: `Ошибка: ${data.error ?? res.statusText}` }));
        return;
      }
      const s = data.summary as { fetched: number; filtered: number; inserted: number; error?: string };
      setRunResults((prev) => ({
        ...prev,
        [source.id]: s.error
          ? `Ошибка: ${s.error}`
          : `Постов: ${s.fetched} · со ссылками: ${s.filtered} · новых кандидатов: ${s.inserted}`,
      }));
      router.refresh();
    } catch (err) {
      setRunResults((prev) => ({
        ...prev,
        [source.id]: `Ошибка: ${err instanceof Error ? err.message : String(err)}`,
      }));
    } finally {
      setRunningId(null);
    }
  };

  const handleAddSource = async () => {
    setAddError(null);
    if (!newIdentifier.trim()) {
      setAddError("Укажите канал (@handle) или URL раздела форума");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/grabber/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newType, identifier: newIdentifier.trim(), label: newLabel.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(res.status === 409 ? "Такой источник уже добавлен" : (data.error ?? "Не удалось добавить"));
        return;
      }
      setSources((prev) => [...prev, data.source as GrabberSourceRow]);
      setNewIdentifier("");
      setNewLabel("");
      setShowAddForm(false);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Граббер маршрутов</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Лиды из телеграм-каналов и форумов — не готовые маршруты. Проверяйте ссылку перед импортом.
        </p>

        {/* ── Sources ──────────────────────────────────────────────────── */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Источники</h2>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showAddForm ? "Отмена" : "+ Добавить источник"}
            </button>
          </div>

          {showAddForm && (
            <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as GrabberSourceRow["type"])}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                >
                  <option value="telegram-preview">Telegram-канал</option>
                  <option value="ips-forum">Раздел форума (IPS)</option>
                </select>
                <input
                  value={newIdentifier}
                  onChange={(e) => setNewIdentifier(e.target.value)}
                  placeholder={newType === "telegram-preview" ? "@channel_handle" : "https://forum.example/forum/12-.../"}
                  className="min-w-[220px] flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                />
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Название (необязательно)"
                  className="w-48 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                />
              </div>
              {addError && <p className="mt-2 text-sm text-red-600">{addError}</p>}
              <button
                onClick={handleAddSource}
                disabled={adding}
                className="mt-3 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Добавить
              </button>
            </div>
          )}

          <ul className="mt-3 space-y-2">
            {sources.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-neutral-900">
                    {s.label ?? s.identifier}
                    <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal text-neutral-500">
                      {TYPE_LABELS[s.type]}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-400">
                    {s.last_error ? <span className="text-red-500">Ошибка: {s.last_error}</span> : formatLastRun(s.last_run_at)}
                  </div>
                  {runResults[s.id] && <div className="mt-1 text-xs text-neutral-600">{runResults[s.id]}</div>}
                </div>
                <button
                  onClick={() => handleRunSource(s)}
                  disabled={runningId === s.id}
                  className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50"
                >
                  {runningId === s.id ? "Проверяю…" : "Проверить"}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Candidates ───────────────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">На проверку</h2>

          {candidates.length === 0 && (
            <p className="mt-4 text-neutral-500">Пока нет кандидатов на проверку.</p>
          )}

          <ul className="mt-3 space-y-4">
            {candidates.map((c) => (
              <li key={c.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                      {sourceLabel(c.source)} · confidence {c.confidence.toFixed(2)}
                    </div>
                    <h3 className="mt-1 font-medium text-neutral-900">{c.title ?? "Без названия"}</h3>
                    {c.region && <div className="text-sm text-neutral-500">{c.region}</div>}
                  </div>
                  <a
                    href={c.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-sm text-blue-600 hover:underline"
                  >
                    Открыть пост →
                  </a>
                </div>

                {c.summary && <p className="mt-2 text-sm text-neutral-700">{c.summary}</p>}

                <div className="mt-2 flex flex-wrap gap-2">
                  {c.links.map((l, i) => (
                    <a
                      key={i}
                      href={l.resolvedUrl ?? l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-200"
                    >
                      {LINK_LABELS[l.type] ?? l.type}
                    </a>
                  ))}
                </div>

                {c.raw_snippet && (
                  <details className="mt-2 text-xs text-neutral-400">
                    <summary className="cursor-pointer">Исходный текст</summary>
                    <p className="mt-1 whitespace-pre-wrap">{c.raw_snippet}</p>
                  </details>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleImport(c)}
                    disabled={pending === c.id}
                    className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Импортировать
                  </button>
                  <button
                    onClick={() => updateStatus(c.id, "rejected")}
                    disabled={pending === c.id}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-500 disabled:opacity-50"
                  >
                    Отклонить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
