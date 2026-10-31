# CycleConnect

Веб-платформа для велосипедистов: маршруты, групповые выезды, клубы и AI-поиск.
Приложение построено на Next.js 16, React 19 и TypeScript; данные и авторизация
работают через self-hosted Supabase.

## Быстрый старт

Нужен Node.js 24. Для локального запуска:

```bash
npm ci
cp .env.example .env.local
```

Заполните в `.env.local` адрес self-hosted Supabase, anon key и service role key.
Используйте локальный или тестовый проект и не подключайте dev-сборку к базе с
production-данными: некоторые серверные действия используют service role key.
Затем запустите:

```bash
npm run dev
```

Откройте <http://localhost:3000>. Остальные переменные окружения нужны только
для соответствующих интеграций; основные настройки — в [.env.example](.env.example).

## Инфраструктура и AI

Для полноценного развёртывания нужен self-hosted Supabase с Postgres/Auth,
Storage, Realtime и Edge Functions. Полный локальный Docker Compose Supabase
в репозитории не хранится. В приложении используются Supabase JS/SSR SDK,
Edge Functions и same-origin rewrites `/api/supabase/*` к API Supabase.

AI-интеграции работают через Gemini: чат и JSON используют
`gemini-3.5-flash-lite`, embeddings — `gemini-embedding-2` с размерностью 1024.
На production локальный Ollama отключён (`LOCAL_AI_ENABLED=false`), провайдер
векторизации задаётся как `EMBEDDING_PROVIDER=gemini`. [.env.example](.env.example)
содержит шаблон для локальной разработки; production env настраивается отдельно
на сервере. Не публикуйте API keys. Имя `src/lib/embeddings/jina.ts` историческое.

Интеграция Strava сейчас отключена несколькими флагами в коде, поэтому одних
ключей окружения недостаточно для её включения.

## Команды

```bash
npm run dev          # локальная разработка
npm run build        # production-сборка
npm run start        # запуск production-сборки
npm run lint         # ESLint
npm test             # Vitest, однократный запуск
npm run test:watch   # Vitest в watch-режиме
npx tsc --noEmit     # проверка типов
```

## Структура

- `src/app/` — страницы и API route handlers
- `src/components/` — интерфейс и feature-компоненты
- `src/lib/` — клиенты и прикладная логика
- `supabase/migrations/` — SQL-миграции; деплой не применяет их автоматически
- `supabase/functions/` — Edge Functions
- `docs/RUNBOOK.md` — продакшн, деплой, миграции и диагностика

## CI и продакшн

Production размещён на `cc` в Compose project `cc-stage`; приложение,
`.env.production` и Supabase stack находятся отдельно. Docker получает env как
BuildKit secret на время сборки, сам контейнер читает серверный env-файл при
запуске. Backend-порты не опубликованы; web-трафик входит через gateway
`80/443`, администрирование — по SSH.

Production перенесён на новый VPS. Пройдены 58 тестов, TypeScript, production
Docker build, Auth/RLS, AI Search и проверка 186 файлов Storage по SHA-256;
30 маршрутов переиндексированы через Gemini. Реальный вход через Google OAuth
в браузере не проверялся. Push в `main` запускает CI и затем deploy на `cc`.

Текущие адреса, расписание, бэкапы, ручное применение миграций и восстановление — в
[runbook](docs/RUNBOOK.md).
