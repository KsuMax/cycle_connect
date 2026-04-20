export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="h-7 w-48 rounded bg-[#F5F4F1] animate-pulse mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[#E4E4E7] overflow-hidden bg-white">
            <div className="h-40 bg-[#F5F4F1] animate-pulse" />
            <div className="p-4 space-y-3">
              <div className="h-5 w-3/4 rounded bg-[#F5F4F1] animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-[#F5F4F1] animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-[#F5F4F1] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
