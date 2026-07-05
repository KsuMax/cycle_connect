"use client";

import { useState } from "react";
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

function sourceLabel(source: GrabberCandidate["source"]): string {
  const s = Array.isArray(source) ? source[0] : source;
  return s?.label ?? "Источник";
}

export function GrabberClient({ initialCandidates }: { initialCandidates: GrabberCandidate[] }) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [pending, setPending] = useState<string | null>(null);
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

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Граббер маршрутов</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Лиды из телеграм-каналов и форумов — не готовые маршруты. Проверяйте ссылку перед импортом.
        </p>

        {candidates.length === 0 && (
          <p className="mt-10 text-neutral-500">Пока нет кандидатов на проверку.</p>
        )}

        <ul className="mt-6 space-y-4">
          {candidates.map((c) => (
            <li key={c.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                    {sourceLabel(c.source)} · confidence {c.confidence.toFixed(2)}
                  </div>
                  <h2 className="mt-1 font-medium text-neutral-900">{c.title ?? "Без названия"}</h2>
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
      </main>
    </div>
  );
}
