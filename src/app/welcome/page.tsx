import Link from "next/link";

export const metadata = {
  title: "CycleConnect — Сообщество велосипедистов",
  description:
    "От вечерних покатушек до многодневных путешествий. Находи идеальные треки, объединяйся с единомышленниками и превращай заезды в настоящие приключения.",
};

const features = [
  {
    icon: "🗺️",
    color: "bg-orange-light text-orange",
    title: "Карта маршрутов",
    description:
      "Тысячи проверенных треков: дистанция, рельеф, тип покрытия и важные точки. Выбирай маршрут, который подходит именно тебе и твоему байку.",
  },
  {
    icon: "📅",
    color: "bg-teal-light text-teal",
    title: "Совместные выезды",
    description:
      "От локальных заездов выходного дня до масштабных велотуров. Регистрируйся в один клик и получай апдейты прямо в Telegram.",
  },
  {
    icon: "🚴",
    color: "bg-purple-light text-purple",
    title: "Клубы по интересам",
    description:
      "Гревел, шоссе или MTB? Вступай в клубы или создавай свой, чтобы собрать собственную команду для покатушек.",
  },
  {
    icon: "🏆",
    color: "bg-orange-light text-orange",
    title: "Мотивация и награды",
    description:
      "Получай ачивки за пройденные километры и новые маршруты. Покажи всему комьюнити свой стиль езды.",
  },
  {
    icon: "🤖",
    color: "bg-teal-light text-teal",
    title: "Умный ИИ-поиск",
    description:
      'Просто напиши: "грунтовый маршрут на 50 км под Питером" — и нейросеть мгновенно подберёт лучшие варианты.',
  },
  {
    icon: "📊",
    color: "bg-purple-light text-purple",
    title: "Синхронизация со Strava",
    description:
      "Подключи аккаунт в пару кликов, и вся твоя статистика поездок автоматически подтянется в профиль.",
  },
];

const steps = [
  {
    num: "01",
    title: "Вливайся в комьюнити",
    body: "Пара кликов для регистрации, привязка Telegram — и ты часть огромного велосообщества.",
  },
  {
    num: "02",
    title: "Выбери свой путь",
    body: "Используй удобные фильтры или попроси ИИ найти идеальный трек под твоё настроение.",
  },
  {
    num: "03",
    title: "Жми на педали",
    body: "Присоединяйся к событию, зови друзей из клуба и отправляйся в путь!",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface font-sans text-text antialiased">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          {/* Logo — matches main site: Cycle dark, Connect orange */}
          <span className="text-[1.35rem] font-extrabold tracking-tight select-none">
            <span className="text-text">Cycle</span><span className="text-orange">Connect</span>
          </span>

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
            Сообщество велосипедистов России
          </div>

          <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight text-text md:text-6xl">
            Катайся больше.{" "}
            <span className="text-orange">Открывай новые маршруты.</span>{" "}
            <span className="text-teal">Находи своих.</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted leading-relaxed">
            От вечерних покатушек до многодневных путешествий. Находи идеальные
            треки с помощью ИИ, объединяйся с единомышленниками и превращай
            заезды в настоящие приключения!
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
              Твой идеальный заезд начинается здесь.
            </h2>
            <p className="mx-auto max-w-xl text-muted">
              Мы собрали лучшие инструменты, чтобы ты меньше времени тратил на
              планирование и больше — на катание.
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
              От идеи до старта — всего 3 шага.
            </h2>
            <p className="text-muted">
              Меньше организации, больше катания.
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
                  Находи клубы под любой стиль катания
                </h2>
                <p className="mb-8 text-sm leading-relaxed opacity-70">
                  Будь то неспешный велотуризм, грязный MTB, скоростное шоссе
                  или городские покатушки на фиксах — здесь есть клуб для
                  каждого. Присоединяйся к локальным райдерам или собирай свою
                  тусовку.
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
                      <div className="mb-1 font-semibold text-surface">{name}</div>
                      <div className="text-xs opacity-60">{city}</div>
                      <div className="mt-3 flex items-center gap-1.5">
                        <div className="flex -space-x-2">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-6 w-6 rounded-full bg-orange/60 ring-2 ring-text" />
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
                      <div className="mb-1 font-semibold text-surface">{name}</div>
                      <div className="text-xs opacity-60">{city}</div>
                      <div className="mt-3 flex items-center gap-1.5">
                        <div className="flex -space-x-2">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-6 w-6 rounded-full bg-teal/60 ring-2 ring-text" />
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
            Ищешь маршрут? Просто попроси.
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-muted">
            Забудь про сложные фильтры на картах. Опиши идеальную поездку своими
            словами, а наш ИИ подберёт нужные треки за секунду.
          </p>
          <div className="mx-auto max-w-lg rounded-2xl border border-border bg-bg p-5 text-left shadow-card">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-border-strong" />
              <p className="text-sm text-muted italic">
                "грунтовый маршрут на 50 км под Питером"
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
            Готов к новому заезду?
          </h2>
          <p className="mb-10 text-lg opacity-80">
            Присоединяйся к CycleConnect бесплатно. Твоё следующее приключение
            начинается прямо сейчас.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/"
              className="rounded-xl bg-white px-8 py-3.5 font-semibold text-orange shadow-card hover:opacity-90 transition-opacity"
            >
              Влиться в комьюнити
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
          <span className="font-extrabold tracking-tight text-text">
            Cycle<span className="text-orange">Connect</span>
          </span>
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
