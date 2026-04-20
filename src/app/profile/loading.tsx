export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-20 h-20 rounded-full bg-[#F5F4F1] animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-48 rounded bg-[#F5F4F1] animate-pulse" />
          <div className="h-4 w-32 rounded bg-[#F5F4F1] animate-pulse" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-[#F5F4F1] animate-pulse" />
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 w-28 rounded-lg bg-[#F5F4F1] animate-pulse" />
        ))}
      </div>

      {/* Items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-[#F5F4F1] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
