import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** ASCII-only filename slug: Cyrillic transliterated, everything else collapsed to "-". */
function slugifyFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "route";
}

/**
 * GET /api/routes/[id]/export — the route's GPX with a human-readable
 * filename, so downloads and share sheets show "verkhnyaya-volga.gpx"
 * instead of the storage key "route.gpx".
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: route } = await supabase
    .from("routes")
    .select("title, gpx_path")
    .eq("id", id)
    .single();

  if (!route?.gpx_path) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const storageRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/route-gpx/${route.gpx_path}`,
  );
  if (!storageRes.ok) {
    return NextResponse.json({ error: "gpx unavailable" }, { status: 404 });
  }
  const gpx = await storageRes.arrayBuffer();

  const ascii = slugifyFilename(route.title);
  // RFC 6266: plain ASCII fallback + UTF-8 original for browsers that support it.
  const utf8 = encodeURIComponent(`${route.title}.gpx`).replace(/['()]/g, escape);

  return new NextResponse(gpx, {
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ascii}.gpx"; filename*=UTF-8''${utf8}`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
