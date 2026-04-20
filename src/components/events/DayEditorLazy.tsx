"use client";

import dynamic from "next/dynamic";

function EditorSkeleton() {
  return (
    <div className="border border-[#E4E4E7] rounded-xl overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#E4E4E7] bg-[#FAFAF9]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-7 h-7 rounded-lg bg-[#F5F4F1] animate-pulse" />
        ))}
      </div>
      <div className="p-4 space-y-2">
        <div className="h-4 w-2/3 rounded bg-[#F5F4F1] animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-[#F5F4F1] animate-pulse" />
      </div>
    </div>
  );
}

export const DayEditor = dynamic(
  () => import("./DayEditor").then((m) => m.DayEditor),
  {
    ssr: false,
    loading: () => <EditorSkeleton />,
  }
);
