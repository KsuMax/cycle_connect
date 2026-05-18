diff --git a/README.md b/README.md
index e215bc4ccf138bbc38ad58ad57e92135484b3c0f..8f9d828d776d93205088244b49ebe7b779db46a3 100644
--- a/README.md
+++ b/README.md
@@ -1,36 +1,159 @@
-This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).
+# CycleConnect
 
-## Getting Started
+CycleConnect — это веб‑платформа для велосипедистов: маршруты, групповые выезды, клубы и социальные механики в одном приложении.
 
-First, run the development server:
+Репозиторий содержит:
+- фронтенд и API на **Next.js 16 + React 19** (App Router);
+- интеграцию с **Supabase** (Auth, Postgres, Storage, Edge Functions);
+- AI‑поиск по маршрутам (семантика + фильтры + ранжирование);
+- вспомогательные интеграции (Telegram, Strava, погода/ветер, GPX).
+
+---
+
+## Что умеет проект
+
+- Лента маршрутов, событий и ride‑отчётов.
+- Профили пользователей, подписки, лайки, избранное.
+- Клубы и события с участниками.
+- Импорт/загрузка маршрутов (в т.ч. GPX).
+- AI‑поиск маршрутов с фильтрами (дистанция, рельеф, сезонность, POI и пр.).
+- Встроенные прокси‑роуты к Supabase (для REST/Auth/Storage/Realtime/Functions).
+
+---
+
+## Технологический стек
+
+- **Next.js 16**
+- **React 19**
+- **TypeScript**
+- **Supabase (`@supabase/supabase-js`, `@supabase/ssr`)**
+- **Tailwind CSS 4**
+- **Vitest**
+
+---
+
+## Быстрый старт
+
+### 1) Установить зависимости
+
+```bash
+npm install
+```
+
+### 2) Создать `.env.local`
+
+Минимально для запуска нужны:
+
+```bash
+NEXT_PUBLIC_SUPABASE_URL=
+NEXT_PUBLIC_SUPABASE_ANON_KEY=
+SUPABASE_SERVICE_ROLE_KEY=
+NEXT_PUBLIC_APP_URL=http://localhost:3000
+NEXT_PUBLIC_SITE_URL=http://localhost:3000
+```
+
+Дополнительно (по используемым функциям):
+
+```bash
+# AI
+OLLAMA_URL=http://localhost:11434
+OLLAMA_CHAT_MODEL=llama3.2:3b
+OPENROUTER_API_KEY=
+DEEPSEEK_API_KEY=
+
+# Карты
+NEXT_PUBLIC_MAPTILER_KEY=
+
+# Telegram
+NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
+TELEGRAM_BOT_TOKEN=
+TELEGRAM_API_BASE=https://api.telegram.org
+
+# Strava / cron
+STRAVA_CLIENT_ID=
+STRAVA_CLIENT_SECRET=
+STRAVA_REDIRECT_URI=
+STRAVA_WEBHOOK_VERIFY_TOKEN=
+CRON_SECRET=
+```
+
+### 3) Запустить dev‑сервер
 
 ```bash
 npm run dev
-# or
-yarn dev
-# or
-pnpm dev
-# or
-bun dev
 ```
 
-Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
+Откройте `http://localhost:3000`.
+
+---
+
+## Скрипты
+
+```bash
+npm run dev        # запуск dev-сервера
+npm run build      # production build
+npm run start      # запуск production-сборки
+npm run lint       # eslint
+npm run test       # vitest (однократный запуск)
+npm run test:watch # vitest в watch-режиме
+```
+
+---
+
+## Структура проекта (кратко)
+
+```text
+src/
+  app/                 # страницы и route handlers (App Router)
+  components/          # UI и feature-компоненты
+  lib/                 # бизнес-логика, клиенты, трансформации, интеграции
+  types/               # типы доменной модели
+supabase/
+  migrations/          # SQL-миграции
+  functions/           # Edge Functions (Telegram и пр.)
+```
+
+---
+
+## Supabase и миграции
+
+В репозитории есть SQL‑миграции в `supabase/migrations`. Локальный workflow обычно такой:
+
+1. Поднять локальный Supabase (если используете Supabase CLI).
+2. Применить миграции.
+3. Убедиться, что переменные из `.env.local` указывают на нужный инстанс.
+
+> Точный процесс зависит от вашего окружения (Docker/Supabase CLI/удалённый проект).
+
+---
+
+## Интеграции и статус
+
+- **Strava OAuth** в коде предусмотрен, но стартовый endpoint сейчас отмечен как временно отключённый флагом в route handler.
+- **AI‑поиск** использует векторизацию + LLM‑нормализацию запроса и SQL‑фильтрацию/ранжирование.
+- **Telegram** используется для связки аккаунта и уведомлений.
+
+---
 
-You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.
+## Продакшн‑заметки
 
-This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.
+- В `next.config.ts` настроены security headers (CSP, frame/object/base/form restrictions и др.).
+- Есть rewrites для проксирования Supabase endpoint’ов через домен приложения.
+- Включён `output: "standalone"` для удобства контейнеризации деплоя.
 
-## Learn More
+---
 
-To learn more about Next.js, take a look at the following resources:
+## Вклад в проект
 
-- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
-- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
+Если планируете контрибьютить:
 
-You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
+1. Создайте feature‑branch.
+2. Делайте небольшие атомарные коммиты.
+3. Прогоняйте `npm run lint` и `npm run test` перед PR.
+4. В описании PR указывайте, какие сценарии проверены вручную.
 
-## Deploy on Vercel
+---
 
-The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.
+## Лицензия
 
-Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
+Пока не указана отдельно. При необходимости добавьте `LICENSE` в корень репозитория.
