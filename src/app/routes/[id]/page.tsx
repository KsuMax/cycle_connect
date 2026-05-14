import type { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase-server";
import { metaDescription } from "@/lib/seo";
import RoutePageClient from "./RoutePageClient";

const BASE_URL = "https://cycleconnect.cc";

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("routes")
    .select("title, description, distance_km, route_images(url)")
    .eq("id", id)
    .single();

  if (!data) {
    return { title: "Маршрут | CycleConnect" };
  }

  const title = `${data.title} | CycleConnect`;
  const description = data.description
    ? metaDescription(data.description)
    : `Велосипедный маршрут${data.distance_km ? ` · ${Math.round(data.distance_km)} км` : ""} на CycleConnect`;

  const images = (data.route_images as { url: string }[] | null) ?? [];
  const ogImage = images[0]?.url;

  return {
    title,
    description,
    openGraph: {
      title: data.title,
      description,
      url: `${BASE_URL}/routes/${id}`,
      siteName: "CycleConnect",
      type: "article",
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: data.title }] } : {}),
    },
  };
}

export default function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  return <RoutePageClient params={params} />;
}
