import type { MetadataRoute } from "next";
import { createServerSupabase } from "@/lib/supabase-server";

const BASE_URL = "https://cycleconnect.cc";

// Revalidate every hour — new routes/events appear without a full deploy
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createServerSupabase();

  // Fetch public routes
  const { data: routes } = await supabase
    .from("routes")
    .select("id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1000);

  // Fetch upcoming + recent events
  const { data: events } = await supabase
    .from("events")
    .select("id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);

  // Fetch clubs
  const { data: clubs } = await supabase
    .from("clubs")
    .select("slug, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  // Fetch ride reports
  const { data: reports } = await supabase
    .from("ride_reports")
    .select("id, route_id, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/events`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/routes`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/clubs`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/legal/consent`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  const routePages: MetadataRoute.Sitemap = (routes ?? []).map((r) => ({
    url: `${BASE_URL}/routes/${r.id}`,
    lastModified: r.updated_at ? new Date(r.updated_at) : now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const eventPages: MetadataRoute.Sitemap = (events ?? []).map((e) => ({
    url: `${BASE_URL}/events/${e.id}`,
    lastModified: e.updated_at ? new Date(e.updated_at) : now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const clubPages: MetadataRoute.Sitemap = (clubs ?? []).map((c) => ({
    url: `${BASE_URL}/clubs/${c.slug}`,
    lastModified: c.updated_at ? new Date(c.updated_at) : now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const reportPages: MetadataRoute.Sitemap = (reports ?? []).map((r) => ({
    url: `${BASE_URL}/routes/${r.route_id}/report/${r.id}`,
    lastModified: r.created_at ? new Date(r.created_at) : now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticPages, ...eventPages, ...routePages, ...clubPages, ...reportPages];
}
