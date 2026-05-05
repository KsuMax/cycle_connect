import Link from "next/link";

export const metadata = {
  title: "CycleConnect — Сообщество велосипедистов",
  description:
    "Социальный слой для велосипедистов: события, клубы, точки на карте и любимые маршруты. Присоединяйся на этапе раннего доступа.",
};

const features = [
  {
    icon: "📅",
    color: "bg-teal-light text-teal",
    title: "Совместные выезды",
    description:
      "От покатушек выходного дня до многодневных туров. Регистрируйся в один клик и получай апдейты в Telegram.",
  },
  {
    icon: "🚴",
    color: "bg-purple-light text-purple",
    title: "Клубы по интересам",
    description:
      "Гревел, шоссе, MTB или городские покатушки — вступай в клуб или собирай свой и зови единомышленников.",
  },
  {
    icon: "🗺️",
    color: "bg-orange-light text-orange",
    title: "Маршруты и точки",
    description:
      "Делись треками и важными местами: родники, точки сбора, опасные участки, кафе с велопарковкой. Карта оживает находками райдеров.",
  },
  {
    icon: "🔗",
    color: "bg-teal-light text-teal",
    title: "Дружит с твоими инструментами",
    description:
      "Не заставляем переучиваться. Подгружай треки из Komoot, Strava, MapMagic или GPX — мы добавляем социальный слой поверх.",
  },
  {
    icon: "🤖",
    color: "bg-purple-light text-purple",
    title: "ИИ-поиск маршрутов",
    description:
      'Опиши идеальную поездку словами — «грунт на 50 км под Питером» — и нейросеть подберёт подходящие треки.',
  },
  {
    icon: "📊",
    color: "bg-orange-light text-orange",
    title: "Синхронизация со Strava",
    description:
      "Подключи аккаунт в пару кликов — статистика поездок автоматически подтянется в профиль.",
  },
];

const steps = [
  {
    num: "01",
    title: "Заходи через Telegram",
    body: "Никаких паролей. Регистрация в один клик — и ты внутри.",
  },
  {
    num: "02",
    title: "Подпишись на интересное",
    body: "Выбери клубы, города и события рядом. Узнавай о выездах первым.",
  },
  {
    num: "03",
    title: "Жми на педали",
    body: "Присоединяйся к заезду или собирай свой и зови друзей.",
  },
];

const roadmap = [
  {
    label: "Уже работает",
    accent: "text-teal",
    items: [
      "События и регистрация на выезды",
      "Клубы и подписки",
      "Импорт треков и точки на карте",
      "Уведомления в Telegram",
    ],
  },
  {
    label: "Делаем сейчас",
    accent: "text-orange",
    items: [
      "ИИ-поиск маршрутов",
      "Синхронизация со Strava",
      "Профили и история заездов",
    ],
  },
  {
    label: "В планах",
    accent: "text-purple",
    items: [
      "Рейтинги и отметки участков",
      "Интеграция с датчиками",
      "Совместное планирование туров",
    ],
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface font-sans text-text antialiased">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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
            <a href="#roadmap" className="hover:text-text transition-colors">
              Roadmap
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
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-orange opacity-10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-teal opacity-10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-muted shadow-card">
            <span className="h-2 w-2 rounded-full bg-teal animate-pulse" />
            Ранний доступ · присоединяйся одним из первых
          </div>

          <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight text-text md:text-6xl">
            Катайся вместе.{" "}
            <span className="text-orange">Делись маршрутами.</span>{" "}
            <span className="text-teal">Находи своих.</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted leading-relaxed">
            CycleConnect — социальный слой для велосипедистов поверх привычных
            карт и трекеров. События, клубы, точки на карте и любимые
            маршруты — всё в одном месте.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/"
              className="rounded-xl bg-orange px-8 py-3.5 font-semibold text-white shadow-card hover:bg-orange-hover transition-all hover:shadow-card-hover"
            >
              Войти через Telegram
            </Link>
            <Link
              href="/events"
              className="rounded-xl border border-border bg-surface px-8 py-3.5 font-semibold text-text shadow-card hover:border-border-strong transition-all hover:shadow-card-hover"
            >
              Посмотреть события
            </Link>
          </div>

          <p className="mt-6 text-sm text-muted">
            Бесплатно. Без паролей. Регистрация занимает секунды.
          </p>
        </div>
      </section>

      {/* Honest "early stage" strip */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 md:grid-cols-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🌱</span>
            <div>
              <div className="font-semibold text-text">Запускаемся</div>
              <p className="text-sm text-muted">
                Проект на этапе раннего доступа. Сообщество растёт от первых
                райдеров — возможно, от тебя.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">🛠</span>
            <div>
              <div className="font-semibold text-text">Делаем открыто</div>
              <p className="text-sm text-muted">
                Roadmap публичный. Идеи и предложения от пользователей реально
                влияют на то, что появится дальше.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">🤝</span>
            <div>
              <div className="font-semibold text-text">Не дублируем — дополняем</div>
              <p className="text-sm text-muted">
                Komoot, Strava, MapMagic — отличные инструменты. Мы добавляем
                поверх социальный слой: люди, события, места.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-bg py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-extrabold text-text">
              Что уже умеет CycleConnect
            </h2>
            <p className="mx-auto max-w-xl text-muted">
              Без перегруза. Только то, чего реально не хватает между навигатором
              и чатом в Telegram.
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
              От регистрации до выезда — три шага
            </h2>
            <p className="text-muted">Меньше организации, больше катания.</p>
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

      {/* Roadmap */}
      <section id="roadmap" className="bg-bg py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-extrabold text-text">
              Что дальше
            </h2>
            <p className="mx-auto max-w-xl text-muted">
              Честный roadmap. Регистрируйся сейчас — и расти вместе с проектом.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {roadmap.map(({ label, accent, items }) => (
              <div
                key={label}
                className="rounded-2xl border border-border bg-surface p-6 shadow-card"
              >
                <div className={`mb-4 text-sm font-semibold uppercase tracking-widest ${accent}`}>
                  {label}
                </div>
                <ul className="space-y-2 text-sm text-text">
                  {items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-muted">·</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community invite */}
      <section className="bg-surface py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="overflow-hidden rounded-3xl bg-text text-surface">
            <div className="grid md:grid-cols-2">
              <div className="flex flex-col justify-center p-10 md:p-14">
                <div className="mb-4 text-sm font-semibold uppercase tracking-widest text-orange">
                  Сообщество
                </div>
                <h2 className="mb-6 text-4xl font-extrabold leading-tight">
                  Стань фундаментом — а не миллионным пользователем
                </h2>
                <p className="mb-8 text-sm leading-relaxed opacity-70">
                  У нас пока нет миллионов райдеров. Зато есть те, кто реально
                  катает и хочет, чтобы появилось удобное место для своих.
                  Создай первый клуб в своём городе или присоединись к
                  ближайшему — и катай с теми, кто рядом.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/clubs"
                    className="rounded-xl bg-teal px-6 py-3 font-semibold text-white hover:opacity-90 transition-opacity"
                  >
                    Найти клуб
                  </Link>
                  <Link
                    href="/clubs/new"
                    className="rounded-xl border border-white/40 px-6 py-3 font-semibold text-surface hover:bg-white/10 transition-colors"
                  >
                    Создать свой
                  </Link>
                </div>
              </div>

              <div className="relative flex items-center justify-center p-10 md:p-14">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { emoji: "🚵", title: "MTB", body: "Грязь, корни, лес" },
                    { emoji: "🏁", title: "Шоссе", body: "Скорость и пелотоны" },
                    { emoji: "🪨", title: "Гревел", body: "Грунт без границ" },
                    { emoji: "🏙", title: "Город", body: "Покатушки по району" },
                  ].map(({ emoji, title, body }) => (
                    <div
                      key={title}
                      className="rounded-2xl bg-surface/10 p-4 ring-1 ring-white/10"
                    >
                      <div className="text-2xl">{emoji}</div>
                      <div className="mt-2 font-semibold text-surface">{title}</div>
                      <div className="text-xs opacity-60">{body}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI search callout */}
      <section className="bg-bg py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-light text-3xl">
            🤖
          </div>
          <h2 className="mb-4 text-4xl font-extrabold text-text">
            Ищешь маршрут? Просто попроси
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-muted">
            Опиши поездку своими словами — ИИ подберёт подходящие треки из
            того, чем уже поделилось сообщество.
          </p>
          <div className="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-5 text-left shadow-card">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-border-strong" />
              <p className="text-sm text-muted italic">
                «грунтовый маршрут на 50 км под Питером»
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-teal">
              <span>→</span>
              <span>Подбираем варианты из треков сообщества</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-orange py-24 text-white">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-4 text-4xl font-extrabold leading-tight">
            Поехали с самого начала?
          </h2>
          <p className="mb-10 text-lg opacity-80">
            Регистрация через Telegram — пара секунд. Бесплатно, без обязательств.
            Влияй на проект, пока он маленький.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/"
              className="rounded-xl bg-white px-8 py-3.5 font-semibold text-orange shadow-card hover:opacity-90 transition-opacity"
            >
              Войти через Telegram
            </Link>
            <Link
              href="/events"
              className="rounded-xl border border-white/40 px-8 py-3.5 font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Сначала осмотреться
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
