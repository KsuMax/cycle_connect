import Link from "next/link";

export const metadata = {
  title: "CycleConnect — Сообщество велосипедистов",
  description:
    "Открывай маршруты, организуй поездки, вступай в клубы и знакомься с велосипедистами со всей России.",
};

const features = [
  {
    icon: "🗺️",
    color: "bg-orange-light text-orange",
    title: "Маршруты",
    description:
      "Тысячи маршрутов с детальным описанием: дистанция, набор высоты, тип покрытия и точки выхода. Поиск через ИИ на живом языке.",
  },
  {
    icon: "📅",
    color: "bg-teal-light text-teal",
    title: "События",
    description:
      "Многодневные экспедиции и групповые заезды. Регистрируйся, следи за участниками, получай уведомления в Telegram.",
  },
  {
    icon: "🚴",
    color: "bg-purple-light text-purple",
    title: "Клубы",
    description:
      "Создавай клуб или вступай в существующий. Открытые, закрытые и клубы по заявкам — гибкое управление участниками.",
  },
  {
    icon: "🏆",
    color: "bg-orange-light text-orange",
    title: "Достижения",
    description:
      "Разблокируй награды за активность: первый маршрут, подписчики, километры. Показывай на профиле, что ты за гонщик.",
  },
  {
    icon: "🤖",
    color: "bg-teal-light text-teal",
    title: "ИИ-поиск",
    description:
      'Спроси "лёгкий маршрут по асфальту на 50 км рядом с Питером" — ИИ сам разберёт запрос и найдёт подходящие треки.',
  },
  {
    icon: "📊",
    color: "bg-purple-light text-purple",
    title: "Strava-интеграция",
    description:
      "Подключи Strava и все твои активности автоматически появятся в профиле. Одна экосистема для всех данных.",
  },
];

const steps = [
  {
    num: "01",
    title: "Создай профиль",
    body: "Зарегистрируйся за 30 секунд. Добавь фото, город, ссылку на Strava и Telegram — и ты в сообществе.",
  },
  {
    num: "02",
    title: "Найди маршрут",
    body: "Используй фильтры или просто напиши запрос в поиске. ИИ подберёт треки под твой уровень и велосипед.",
  },
  {
    num: "03",
    title: "Поехали вместе",
    body: "Зарегистрируйся на событие, вступи в клуб и познакомься с теми, кто едет тем же маршрутом в те же выходные.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface font-sans text-text antialiased">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-orange">Cycle</span>
            <span className="text-xl font-bold text-text">Connect</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#features" className="hover:text-text transition-colors">
              Возможности
            </a>
            <a href="#how" className="hover:text-text transition-colors">
              Как это работает
            </a>
            <a href="#community" className="hover:text-text transition-colors">
              Сообщество
            </a>
          </nav>
          <Link
            href="/"
            className="rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-hover transition-colors"
          >
            Войти
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-bg py-24 md:py-36">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-orange opacity-10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-teal opacity-10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-muted shadow-card">
            <span className="h-2 w-2 rounded-full bg-teal animate-pulse" />
            Платформа для велосипедистов России
          </div>

          <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight text-text md:text-6xl">
            Езди дальше.{" "}
            <span className="text-orange">Открывай новое.</span>{" "}
            Знакомься с{" "}
            <span className="text-teal">велосипедистами.</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted leading-relaxed">
            CycleConnect — это место, где маршруты превращаются в приключения,
            а одиночные заезды становятся групповыми. Открывай треки, вступай
            в клубы и находи тех, кто едет рядом.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/routes"
              className="rounded-xl bg-orange px-8 py-3.5 font-semibold text-white shadow-card hover:bg-orange-hover transition-all hover:shadow-card-hover"
            >
              Смотреть маршруты
            </Link>
            <Link
              href="/events"
              className="rounded-xl border border-border bg-surface px-8 py-3.5 font-semibold text-text shadow-card hover:border-border-strong transition-all hover:shadow-card-hover"
            >
              Ближайшие события
            </Link>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-border md:grid-cols-4">
          {[
            { value: "500+", label: "Маршрутов" },
            { value: "120+", label: "Клубов" },
            { value: "3 000+", label: "Велосипедистов" },
            { value: "50+", label: "Городов" },
          ].map(({ value, label }) => (
            <div key={label} className="py-8 text-center">
              <div className="text-3xl font-extrabold text-orange">{value}</div>
              <div className="mt-1 text-sm text-muted">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-bg py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-extrabold text-text">
              Всё, что нужно велосипедисту
            </h2>
            <p className="mx-auto max-w-xl text-muted">
              Маршруты, события, клубы, достижения и ИИ-поиск — в одном месте,
              без лишнего.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon, color, title, description }) => (
              <div
                key={title}
                className="rounded-2xl border border-border bg-surface p-6 shadow-card transition-shadow hover:shadow-card-hover"
              >
                <div
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${color}`}
                >
                  {icon}
                </div>
                <h3 className="mb-2 text-lg font-bold text-text">{title}</h3>
                <p className="text-sm leading-relaxed text-muted">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-surface py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-extrabold text-text">
              Как это работает
            </h2>
            <p className="text-muted">
              Три шага от регистрации до первой групповой поездки.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {steps.map(({ num, title, body }) => (
              <div key={num} className="relative flex flex-col items-start">
                <div className="mb-4 text-5xl font-extrabold text-orange opacity-20 select-none">
                  {num}
                </div>
                <h3 className="mb-2 text-xl font-bold text-text">{title}</h3>
                <p className="text-sm leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community highlight */}
      <section id="community" className="bg-bg py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="overflow-hidden rounded-3xl bg-text text-surface">
            <div className="grid md:grid-cols-2">
              {/* Left text */}
              <div className="flex flex-col justify-center p-10 md:p-14">
                <div className="mb-4 text-sm font-semibold uppercase tracking-widest text-orange">
                  Сообщество
                </div>
                <h2 className="mb-6 text-4xl font-extrabold leading-tight">
                  Клубы для всех стилей катания
                </h2>
                <p className="mb-8 text-sm leading-relaxed opacity-70">
                  Гравел, шоссе, MTB, туринг — в CycleConnect каждый найдёт
                  клуб по душе. Создай свой или вступи в один из существующих
                  и планируй поездки вместе.
                </p>
                <Link
                  href="/clubs"
                  className="self-start rounded-xl bg-teal px-6 py-3 font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  Найти клуб
                </Link>
              </div>

              {/* Right mockup cards */}
              <div className="flex items-center justify-center gap-4 p-10 md:p-14">
                <div className="flex flex-col gap-4 pt-6">
                  {[
                    { name: "СПб Грависты", city: "Санкт-Петербург", n: 48 },
                    { name: "MTB Москва", city: "Москва", n: 134 },
                  ].map(({ name, city, n }) => (
                    <div
                      key={name}
                      className="w-56 rounded-2xl bg-surface/10 p-4 backdrop-blur-sm ring-1 ring-white/10"
                    >
                      <div className="mb-1 font-semibold text-surface">
                        {name}
                      </div>
                      <div className="text-xs opacity-60">{city}</div>
                      <div className="mt-3 flex items-center gap-1.5">
                        <div className="flex -space-x-2">
                          {[...Array(3)].map((_, i) => (
                            <div
                              key={i}
                              className="h-6 w-6 rounded-full bg-orange/60 ring-2 ring-text"
                            />
                          ))}
                        </div>
                        <span className="text-xs opacity-60">{n} участников</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-4 pb-6">
                  {[
                    { name: "Карелия Тур", city: "Петрозаводск", n: 27 },
                    { name: "Урал Байкерс", city: "Екатеринбург", n: 62 },
                  ].map(({ name, city, n }) => (
                    <div
                      key={name}
                      className="w-56 rounded-2xl bg-surface/10 p-4 backdrop-blur-sm ring-1 ring-white/10"
                    >
                      <div className="mb-1 font-semibold text-surface">
                        {name}
                      </div>
                      <div className="text-xs opacity-60">{city}</div>
                      <div className="mt-3 flex items-center gap-1.5">
                        <div className="flex -space-x-2">
                          {[...Array(3)].map((_, i) => (
                            <div
                              key={i}
                              className="h-6 w-6 rounded-full bg-teal/60 ring-2 ring-text"
                            />
                          ))}
                        </div>
                        <span className="text-xs opacity-60">{n} участников</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI search callout */}
      <section className="bg-surface py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-light text-3xl">
            🤖
          </div>
          <h2 className="mb-4 text-4xl font-extrabold text-text">
            Поиск на живом языке
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-muted">
            Не нужно возиться с фильтрами. Просто напиши что хочешь — ИИ
            разберёт запрос и найдёт треки под твои условия.
          </p>
          <div className="mx-auto max-w-lg rounded-2xl border border-border bg-bg p-5 text-left shadow-card">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-border-strong" />
              <p className="text-sm text-muted italic">
                "лёгкий маршрут по асфальту на выходной, 60–80 км, Карелия"
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-teal">
              <span>→</span>
              <span>Найдено 6 маршрутов рядом с вами</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-orange py-24 text-white">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-4 text-4xl font-extrabold leading-tight">
            Готов крутить педали с нами?
          </h2>
          <p className="mb-10 text-lg opacity-80">
            Регистрация бесплатна. Первый маршрут — уже сегодня.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/"
              className="rounded-xl bg-white px-8 py-3.5 font-semibold text-orange shadow-card hover:opacity-90 transition-opacity"
            >
              Начать бесплатно
            </Link>
            <Link
              href="/routes"
              className="rounded-xl border border-white/40 px-8 py-3.5 font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Смотреть маршруты
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-surface py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted sm:flex-row">
          <div className="flex items-center gap-1.5 font-semibold text-text">
            <span className="text-orange">Cycle</span>Connect
          </div>
          <div className="flex gap-6">
            <Link href="/routes" className="hover:text-text transition-colors">
              Маршруты
            </Link>
            <Link href="/events" className="hover:text-text transition-colors">
              События
            </Link>
            <Link href="/clubs" className="hover:text-text transition-colors">
              Клубы
            </Link>
          </div>
          <p>© {new Date().getFullYear()} CycleConnect</p>
        </div>
      </footer>
    </div>
  );
}
