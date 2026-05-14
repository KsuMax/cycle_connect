import type { MetadataRoute } from "next";
import { createAdminSupabase } from "@/lib/supabase-admin";

const BASE_URL = "https://cycleconnect.cc";

// Always regenerate on request — RLS-free admin client enumerates all
// public content; revalidate keeps it cheap.
export const revalidate = 3600;
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminSupabase();

  const [routesRes, eventsRes, clubsRes, reportsRes] = await Promise.all([
    supabase
      .from("routes")
      .select("id, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabase
      .from("events")
      .select("id, updated_at")
      .order("updated_at", { ascending: false })
      .limit(2000),
    supabase
      .from("clubs")
      .select("slug, updated_at, visibility")
      .neq("visibility", "closed")
      .order("updated_at", { ascending: false })
      .limit(2000),
    supabase
      .from("ride_reports")
      .select("id, route_id, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  const routes = routesRes.data;
  const events = eventsRes.data;
  const clubs = clubsRes.data;
  const reports = reportsRes.data;

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

  const reportPages: MetadataRoute.Sitemap = (reports ?? [])
    .filter((r) => r.route_id)
    .map((r) => ({
      url: `${BASE_URL}/routes/${r.route_id}/report/${r.id}`,
      lastModified: r.created_at ? new Date(r.created_at) : now,
      changeFrequency: "monthly",
      priority: 0.5,
    }));

  return [...staticPages, ...eventPages, ...routePages, ...clubPages, ...reportPages];
}
