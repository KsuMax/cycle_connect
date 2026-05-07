import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const MAX_GPX_BYTES = 5 * 1024 * 1024;     // 5 MB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Cheap GPX validation: pull the first 4 KB and look for an XML root
 * <gpx ...> element. Lets us reject ZIPs, EXEs, HTML, etc. without
 * pulling a full XML parser.
 */
async function looksLikeGpx(buf: ArrayBuffer): Promise<boolean> {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(
    new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096)),
  );
  // Must start with an XML prolog or whitespace, then contain <gpx within
  // the first chunk. Order-tolerant for files without <?xml ?> header.
  if (!/^\s*(?:<\?xml[^>]*\?>\s*)?<gpx\b/i.test(head)) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return json({ error: "invalid form data" }, 400);
  }

  const routeId = formData.get("routeId");
  const file = formData.get("file");

  if (typeof routeId !== "string" || !UUID_RE.test(routeId)) {
    // UUID-only — prevents path traversal and weird storage keys.
    return json({ error: "routeId must be uuid" }, 400);
  }
  if (!(file instanceof File)) return json({ error: "file required" }, 400);

  // Size cap (5 MB) — multi-day GPX traces fit easily under 1 MB.
  if (file.size === 0) return json({ error: "file empty" }, 400);
  if (file.size > MAX_GPX_BYTES) {
    return json({ error: "file too large", max_bytes: MAX_GPX_BYTES }, 413);
  }

  const arrayBuffer = await file.arrayBuffer();
  if (!(await looksLikeGpx(arrayBuffer))) {
    return json({ error: "not a gpx file" }, 400);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Verify ownership
  const { data: route } = await admin
    .from("routes")
    .select("author_id")
    .eq("id", routeId)
    .single();

  if (!route || route.author_id !== user.id) return json({ error: "forbidden" }, 403);

  const path = `${routeId}/route.gpx`;
  const { error: uploadError } = await admin.storage
    .from("route-gpx")
    .upload(path, arrayBuffer, {
      upsert: true,
      contentType: "application/gpx+xml",
    });

  if (uploadError) return json({ error: uploadError.message }, 500);

  await admin
    .from("routes")
    .update({ gpx_path: path, gpx_updated_at: new Date().toISOString() })
    .eq("id", routeId);

  return json({ path });
}
