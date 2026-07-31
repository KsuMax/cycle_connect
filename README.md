# CycleConnect

CycleConnect — это веб-платформа для велосипедистов: маршруты, групповые выезды, клубы и социальные механики в одном приложении.

Репозиторий содержит:
- фронтенд и API на **Next.js 16 + React 19** (App Router);
- интеграцию с **Supabase** (Auth, Postgres, Storage, Edge Functions);
- AI-поиск по маршрутам (семантика + фильтры + ранжирование);
- вспомогательные интеграции (Telegram, Strava, погода/ветер, GPX).

---

## Что умеет проект

- Лента маршрутов, событий и ride-отчётов.
- Профили пользователей, подписки, лайки, избранное.
- Клубы и события с участниками.
- Импорт/загрузка маршрутов (в т.ч. GPX).
- AI-поиск маршрутов с фильтрами (дистанция, рельеф, сезонность, POI и пр.).
- Встроенные прокси-роуты к Supabase (для REST/Auth/Storage/Realtime/Functions).

---

## Технологический стек

- **Next.js 16**
- **React 19**
- **TypeScript**
- **Supabase (`@supabase/supabase-js`, `@supabase/ssr`)**
- **Tailwind CSS 4**
- **Vitest**

---

## Быстрый старт

### 1) Установить зависимости

```bash
npm install
```

### 2) Создать `.env.local`

Минимально для запуска нужны:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Дополнительно (по используемым функциям):

```env
# AI — цепочка провайдеров: Gemini → OpenRouter → Ollama → DeepSeek
GEMINI_API_KEY=              # ключ Google AI Studio (AIza…), основной провайдер
GEMINI_MODELS=               # необязательно; по умолчанию gemini-3.5-flash,gemini-2.5-flash
OLLAMA_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2:3b
OPENROUTER_API_KEY=
DEEPSEEK_API_KEY=

# Карты
NEXT_PUBLIC_MAPTILER_KEY=

# Telegram
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
TELEGRAM_BOT_TOKEN=
TELEGRAM_API_BASE=https://api.telegram.org

# Egress через SOCKS5-туннель. На проде обязателен: российский IP VPS
# блокируют и Google (400 FAILED_PRECONDITION), и OpenRouter (403), и Telegram.
# Локально не задавать — соединения пойдут напрямую.
SOCKS_PROXY=                 # напр. socks5h://host.docker.internal:1080
TELEGRAM_SOCKS_PROXY=        # историческое имя того же туннеля, тоже работает

# Strava / cron
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=
STRAVA_WEBHOOK_VERIFY_TOKEN=
CRON_SECRET=
```

### 3) Запустить dev-сервер

```bash
npm run dev
```

Откройте `http://localhost:3000`.

---

## Скрипты

```bash
npm run dev        # запуск dev-сервера
npm run build      # production build
npm run start      # запуск production-сборки
npm run lint       # eslint
npm run test       # vitest (однократный запуск)
npm run test:watch # vitest в watch-режиме
```

---

## Структура проекта

```text
src/
  app/                 # страницы и route handlers (App Router)
  components/          # UI и feature-компоненты
  lib/                 # бизнес-логика, клиенты, трансформации, интеграции
  types/               # типы доменной модели

supabase/
  migrations/          # SQL-миграции
  functions/           # Edge Functions (Telegram и пр.)
```

---

## Supabase и миграции

В репозитории есть SQL-миграции в `supabase/migrations`.

Типовой workflow:

1. Поднять локальный Supabase.
2. Применить миграции.
3. Проверить переменные из `.env.local`.

---

## Интеграции

- **Strava OAuth** — предусмотрен в коде, но стартовый endpoint временно отключён флагом в route handler.
- **AI-поиск** — использует векторизацию, LLM-нормализацию запроса и SQL-ранжирование.
- **Telegram** — используется для связки аккаунта и уведомлений.

---

## Продакшн

- В `next.config.ts` настроены security headers.
- Есть rewrites для проксирования Supabase endpoint’ов через домен приложения.
- Используется `output: "standalone"` для контейнеризации и деплоя.

---

## Вклад в проект

1. Создайте feature-branch.
2. Делайте небольшие атомарные коммиты.
3. Перед PR запускайте:

```bash
npm run lint
npm run test
```

4. В описании PR указывайте проверенные сценарии.

---

