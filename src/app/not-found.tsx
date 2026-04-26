import Link from "next/link";

export const metadata = {
  title: "404 — Страница не найдена | CycleConnect",
};

export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-bg flex flex-col">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-orange opacity-[0.07] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-teal opacity-[0.07] blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-purple opacity-[0.04] blur-3xl" />

      {/* Header */}
      <header className="relative z-10 border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-1 text-xl font-bold">
            <span className="text-orange">Cycle</span>
            <span className="text-text">Connect</span>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">

        {/* Wheel SVG illustration */}
        <div className="mb-8 flex items-center justify-center">
          <svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="opacity-90"
            aria-hidden="true"
          >
            {/* Outer rim */}
            <circle cx="80" cy="80" r="72" stroke="#F4632A" strokeWidth="6" strokeDasharray="16 8" />
            {/* Inner rim */}
            <circle cx="80" cy="80" r="54" stroke="#E4E4E7" strokeWidth="3" />
            {/* Hub */}
            <circle cx="80" cy="80" r="12" fill="#F4632A" />
            <circle cx="80" cy="80" r="6" fill="white" />
            {/* Spokes — 8 spokes */}
            {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5].map((angle, i) => {
              const rad = (angle * Math.PI) / 180;
              const x1 = 80 + 14 * Math.cos(rad);
              const y1 = 80 + 14 * Math.sin(rad);
              const x2 = 80 + 52 * Math.cos(rad);
              const y2 = 80 + 52 * Math.sin(rad);
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#D1D1D6"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              );
            })}
            {/* Broken spoke highlight */}
            <line x1="80" y1="66" x2="80" y2="28" stroke="#0BBFB5" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 4" />
          </svg>
        </div>

        {/* 404 number */}
        <div className="relative mb-4 select-none">
          <span className="text-[120px] font-extrabold leading-none tracking-tighter text-border-strong opacity-30 md:text-[160px]">
            404
          </span>
          <span className="absolute inset-0 flex items-center justify-center text-[120px] font-extrabold leading-none tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-orange via-orange to-teal md:text-[160px]">
            404
          </span>
        </div>

        <h1 className="mb-3 text-2xl font-extrabold text-text md:text-3xl">
          Кажется, ты свернул не туда
        </h1>
        <p className="mx-auto mb-10 max-w-sm text-base leading-relaxed text-muted">
          Эта страница не существует или была удалена. Давай вернём тебя на правильный маршрут.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="rounded-xl bg-orange px-7 py-3 font-semibold text-white shadow-card transition-all hover:bg-orange-hover hover:shadow-card-hover"
          >
            На главную
          </Link>
          <Link
            href="/routes"
            className="rounded-xl border border-border bg-surface px-7 py-3 font-semibold text-text shadow-card transition-all hover:border-border-strong hover:shadow-card-hover"
          >
            Маршруты
          </Link>
          <Link
            href="/events"
            className="rounded-xl border border-border bg-surface px-7 py-3 font-semibold text-text shadow-card transition-all hover:border-border-strong hover:shadow-card-hover"
          >
            События
          </Link>
        </div>

        {/* Quick links */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
          {[
            { href: "/clubs", label: "Клубы" },
            { href: "/users", label: "Велосипедисты" },
            { href: "/profile", label: "Профиль" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="hover:text-orange transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border bg-surface/60 py-6">
        <p className="text-center text-xs text-subtle">
          © {new Date().getFullYear()} CycleConnect
        </p>
      </footer>
    </div>
  );
}
