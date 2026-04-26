import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
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

  if (typeof routeId !== "string" || !routeId) return json({ error: "routeId required" }, 400);
  if (!(file instanceof File)) return json({ error: "file required" }, 400);

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
  const arrayBuffer = await file.arrayBuffer();
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
