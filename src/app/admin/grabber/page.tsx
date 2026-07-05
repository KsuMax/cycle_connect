import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { GrabberClient, type GrabberCandidate, type GrabberSourceRow } from "./GrabberClient";

export const dynamic = "force-dynamic";

export default async function GrabberAdminPage() {
  const supabase = await createServerSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) redirect("/");

  const [{ data: candidates }, { data: sources }] = await Promise.all([
    supabase
      .from("grabber_candidates")
      .select(
        "id, permalink, title, region, summary, links, confidence, raw_snippet, status, created_at, source:grabber_sources(label, type)"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("grabber_sources")
      .select("id, type, identifier, label, enabled, last_run_at, last_error")
      .order("type")
      .order("label"),
  ]);

  return (
    <GrabberClient
      initialCandidates={(candidates as unknown as GrabberCandidate[]) ?? []}
      initialSources={(sources as unknown as GrabberSourceRow[]) ?? []}
    />
  );
}
