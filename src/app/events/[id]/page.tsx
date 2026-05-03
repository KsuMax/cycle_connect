import type { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase-server";
import EventPageClient from "./EventPageClient";

const BASE_URL = "https://cycleconnect.cc";

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("events")
    .select("title, description, cover_url, start_date")
    .eq("id", id)
    .single();

  if (!data) {
    return { title: "Событие | CycleConnect" };
  }

  const title = `${data.title} | CycleConnect`;
  const description = data.description
    ? data.description.replace(/<[^>]+>/g, "").slice(0, 160)
    : `Велосипедное событие на CycleConnect${data.start_date ? ` · ${new Date(data.start_date).toLocaleDateString("ru-RU")}` : ""}`;

  return {
    title,
    description,
    openGraph: {
      title: data.title,
      description,
      url: `${BASE_URL}/events/${id}`,
      siteName: "CycleConnect",
      type: "article",
      ...(data.cover_url ? { images: [{ url: data.cover_url, width: 1200, height: 630, alt: data.title }] } : {}),
    },
  };
}

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  return <EventPageClient params={params} />;
}
