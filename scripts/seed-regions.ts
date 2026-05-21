#!/usr/bin/env npx tsx
/**
 * Seed `regions` from an OSM admin_level=4 GeoJSON for Russia.
 *
 * Source (download once and place at ./data/russia-subjects.geojson):
 *   https://raw.githubusercontent.com/timurkanaz/Russia_geojson_OSM/master/GeoJson%27s/Countries/Russia_regions.geojson
 *
 * Each feature must expose at least one of these properties:
 *   - region          — short OSM label with abbreviations ("Тверская обл.")
 *   - name:ru / name  — formal label
 *   - full_name       — formal subject name (optional, falls back to name)
 *
 * Usage (on the VPS where .env.local has service role key):
 *   npx tsx scripts/seed-regions.ts [./data/russia-subjects.geojson]
 *
 * Env:
 *   DRY_RUN=1  — parse + log, no writes
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DRY_RUN      = process.env.DRY_RUN === "1";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Normalize OSM `region` (with abbreviations) → formal full_name ──────────
// The single-file source uses abbreviations like "обл." / "АО" and various
// dash styles. Map every value we expect to the formal full name that
// SHORT_NAME below is keyed by, so the rest of the pipeline is uniform.
function normalizeOsmName(raw: string): string {
  let s = raw.trim();
  // Drop "(short)" parentheticals like "Республика Адыгея (Адыгея)"
  s = s.replace(/\s*\(([^)]+)\)\s*$/u, (_m, inner) =>
    /Якутия/u.test(inner) ? ` (${inner})` : ""
  );
  // City-of prefixes
  s = s.replace(/^г\.\s*/u, "Город ");
  s = s.replace(/^город федерального значения\s+/iu, "Город ");
  // Hyphen-minus → em-dash between subject and second name
  s = s.replace(/\s*-\s*(Югра|Алания|Кузбасс|Чувашия)\b/u, " — $1");
  // "Чувашская Республика — Чувашия" → drop the trailing "— Чувашия"
  s = s.replace(/\s—\s*Чувашия$/u, "");
  // Abbreviation expansions
  s = s.replace(/\bобл\.\s*/u, "область ").trim();
  s = s.replace(/^Еврейская АО$/u, "Еврейская автономная область");
  s = s.replace(/\bАО\b/u, "автономный округ");
  return s.replace(/\s+/g, " ").trim();
}

// ── Canonical short names for OSM full names ────────────────────────────────
// Maps OSM `name:ru` (formal) → short colloquial label we want in UI.
// Anything not listed here keeps its OSM name as-is.
const SHORT_NAME: Record<string, string> = {
  "Республика Карелия": "Карелия",
  "Республика Крым": "Крым",
  "Республика Татарстан": "Татарстан",
  "Республика Башкортостан": "Башкортостан",
  "Республика Дагестан": "Дагестан",
  "Республика Ингушетия": "Ингушетия",
  "Кабардино-Балкарская Республика": "Кабардино-Балкария",
  "Карачаево-Черкесская Республика": "Карачаево-Черкесия",
  "Республика Северная Осетия — Алания": "Северная Осетия",
  "Чеченская Республика": "Чечня",
  "Чувашская Республика": "Чувашия",
  "Удмуртская Республика": "Удмуртия",
  "Республика Марий Эл": "Марий Эл",
  "Республика Мордовия": "Мордовия",
  "Республика Калмыкия": "Калмыкия",
  "Республика Адыгея": "Адыгея",
  "Республика Алтай": "Республика Алтай", // keep distinct from Алтайский край
  "Республика Тыва": "Тыва",
  "Республика Хакасия": "Хакасия",
  "Республика Бурятия": "Бурятия",
  "Республика Саха (Якутия)": "Якутия",
  "Кемеровская область — Кузбасс": "Кемеровская область",
  "Ханты-Мансийский автономный округ — Югра": "Югра",
  "Ямало-Ненецкий автономный округ": "ЯНАО",
  "Ненецкий автономный округ": "НАО",
  "Чукотский автономный округ": "Чукотка",
  "Еврейская автономная область": "ЕАО",
  "Город Москва": "Москва",
  "Москва": "Москва",
  "Город Санкт-Петербург": "Санкт-Петербург",
  "Санкт-Петербург": "Санкт-Петербург",
  "Город Севастополь": "Севастополь",
  "Севастополь": "Севастополь",
};

// Macro regions: built from already-loaded subject geometries via UNION.
// name → list of subject `full_name`s whose geom to union.
const MACRO_REGIONS: Record<string, string[]> = {
  "Подмосковье": ["Московская область"],
  "Байкал": ["Иркутская область", "Республика Бурятия"],
  "Урал": [
    "Свердловская область",
    "Челябинская область",
    "Пермский край",
    "Курганская область",
    "Оренбургская область",
    "Республика Башкортостан",
  ],
};

// Legacy region values on routes to remap onto the new canonical names.
const LEGACY_REMAP: Record<string, string> = {
  // Existing values that are already canonical: no-op
  "Карелия": "Карелия",
  "Санкт-Петербург": "Санкт-Петербург",
  "Ленинградская область": "Ленинградская область",
  "Москва": "Москва",
  "Подмосковье": "Подмосковье",
  "Краснодарский край": "Краснодарский край",
  "Крым": "Крым",
  "Байкал": "Байкал",
  "Урал": "Урал",
  // "Алтай" was ambiguous in the old whitelist; map onto the krai (more
  // popular for cycling) — users can re-pick if their track was in the republic.
  "Алтай": "Алтайский край",
};

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const path = process.argv[2] ?? "./data/russia-subjects.geojson";
  const abs = resolve(path);
  console.log(`Reading ${abs}`);
  const raw = readFileSync(abs, "utf8");
  const gj = JSON.parse(raw);
  if (gj.type !== "FeatureCollection" || !Array.isArray(gj.features)) {
    throw new Error("Expected a FeatureCollection at the top level");
  }

  let upserted = 0;
  let skipped = 0;

  for (const f of gj.features) {
    const props = f.properties ?? {};
    const rawName: string =
      props["name:ru"] ?? props.name ?? props.NAME ?? props.region ?? "";
    if (!rawName) {
      skipped++;
      continue;
    }
    const fullName = normalizeOsmName(rawName);
    const shortName = SHORT_NAME[fullName] ?? fullName;
    const aliases = fullName !== shortName ? [fullName] : [];

    if (DRY_RUN) {
      console.log(`  subject  ${shortName.padEnd(28)} ← ${fullName}`);
      upserted++;
      continue;
    }

    const geomJson = JSON.stringify(f.geometry);

    // 1. Upsert metadata.
    const up = await sb
      .from("regions")
      .upsert(
        { name: shortName, full_name: fullName, type: "subject", aliases },
        { onConflict: "name" }
      );
    if (up.error) {
      console.error(`upsert ${shortName}:`, up.error.message);
      continue;
    }

    // 2. Set geom via a SQL function (we expose `set_region_geom` below).
    const setGeom = await sb.rpc("set_region_geom", {
      p_name: shortName,
      p_geojson: geomJson,
    });
    if (setGeom.error) {
      console.error(`geom ${shortName}:`, setGeom.error.message);
      continue;
    }
    upserted++;
    if (upserted % 10 === 0) console.log(`  …${upserted} subjects`);
  }

  console.log(`Subjects: upserted=${upserted} skipped=${skipped}`);

  // ── Macro regions ─────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    for (const [macroName, sourceFulls] of Object.entries(MACRO_REGIONS)) {
      const up = await sb
        .from("regions")
        .upsert(
          { name: macroName, full_name: macroName, type: "macro", aliases: [] },
          { onConflict: "name" }
        );
      if (up.error) {
        console.error(`macro upsert ${macroName}:`, up.error.message);
        continue;
      }
      const m = await sb.rpc("set_macro_region_geom", {
        p_name: macroName,
        p_source_full_names: sourceFulls,
      });
      if (m.error) {
        console.error(`macro geom ${macroName}:`, m.error.message);
        continue;
      }
      console.log(`  macro    ${macroName} ← ∪ ${sourceFulls.join(", ")}`);
    }

    // ── Backfill routes.region ─────────────────────────────────────────────
    for (const [from, to] of Object.entries(LEGACY_REMAP)) {
      if (from === to) continue;
      const { error, count } = await sb
        .from("routes")
        .update({ region: to }, { count: "exact" })
        .eq("region", from);
      if (error) console.error(`backfill ${from}→${to}:`, error.message);
      else if (count && count > 0) console.log(`  remapped ${count} routes: ${from} → ${to}`);
    }
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
