"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { ReportCard } from "./ReportCard";
import type { DbRideReport } from "@/lib/supabase";

interface Props {
  routeId: string;
  routeTitle: string;
}

export function RideReportsSection({ routeId, routeTitle }: Props) {
  const { user } = useAuth();
  const [reports, setReports] = useState<DbRideReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("ride_reports")
      .select("id, route_id, user_id, ride_id, ridden_at, vibe, text, photos, created_at, author:profiles!user_id(name, avatar_url)")
      .eq("route_id", routeId)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setReports((data as unknown as DbRideReport[]) ?? []);
        setLoading(false);
      });
  }, [routeId]);

  if (loading) return null;
  if (reports.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookOpen size={18} style={{ color: "#F4632A" }} />
          <h2 className="text-base font-bold text-[#1C1C1E]">
            Отчёты о поездках
            <span className="ml-2 text-sm font-normal text-[#A1A1AA]">{reports.length}</span>
          </h2>
        </div>
        <Link
          href={`/routes/${routeId}/report/new`}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          style={{ backgroundColor: "#F4632A", color: "white" }}
        >
          Написать отчёт
        </Link>
      </div>

      <div className="space-y-4">
        {reports.map((r) => (
          <ReportCard key={r.id} report={r} showRoute={false} currentUserId={user?.id ?? null} />
        ))}
      </div>
    </section>
  );
}
