"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { parseGpxText } from "@/lib/gpx";
import "leaflet/dist/leaflet.css";

/**
 * Renders a route's track on our own Leaflet map, drawn from the stored GPX.
 *
 * Why not just embed the planner? Most planners (Komoot, Strava, esya.ru, …)
 * send `X-Frame-Options`, so their page renders blank in an <iframe>. We have
 * the GPX regardless of source, so we draw the geometry ourselves — one code
 * path that works for every planner. See lib/map-provider.ts.
 *
 * Leaflet is imported lazily inside the effect so it never runs during SSR
 * (it touches `window`/`document` at module load).
 */
export function RouteMap({
  gpxUrl,
  height = 400,
}: {
  gpxUrl: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;

    async function init() {
      try {
        const [{ default: L }, res] = await Promise.all([
          import("leaflet"),
          fetch(gpxUrl),
        ]);
        if (cancelled) return;
        if (!res.ok) throw new Error(`gpx fetch ${res.status}`);

        const { trackpoints } = parseGpxText(await res.text());
        if (cancelled) return;
        if (trackpoints.length < 2 || !containerRef.current) {
          setStatus("error");
          return;
        }

        const latlngs = trackpoints.map((p) => [p.lat, p.lng] as [number, number]);

        map = L.map(containerRef.current, {
          scrollWheelZoom: false,
          attributionControl: true,
        });

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(map);

        const line = L.polyline(latlngs, { color: "#F4632A", weight: 4, opacity: 0.9 });
        line.addTo(map);
        map.fitBounds(line.getBounds(), { padding: [24, 24] });

        // Start (green) / finish (red) dots — circleMarkers avoid Leaflet's
        // bundler-broken default marker image assets entirely.
        const start = latlngs[0];
        const end = latlngs[latlngs.length - 1];
        L.circleMarker(start, { radius: 6, color: "#fff", weight: 2, fillColor: "#16A34A", fillOpacity: 1 })
          .addTo(map)
          .bindTooltip("Старт");
        L.circleMarker(end, { radius: 6, color: "#fff", weight: 2, fillColor: "#DC2626", fillOpacity: 1 })
          .addTo(map)
          .bindTooltip("Финиш");

        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    init();
    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [gpxUrl]);

  if (status === "error") {
    return (
      <div className="relative bg-gradient-to-br from-[#E6FAF9] to-[#D1FAF7] flex items-center justify-center" style={{ height }}>
        <div className="text-center text-[#71717A]">
          <MapPin size={48} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Не удалось построить карту трека</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0" style={{ background: "#EAEAEA" }} />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F5F4F1] pointer-events-none">
          <Loader2 size={24} className="animate-spin text-[#A1A1AA]" />
        </div>
      )}
    </div>
  );
}
