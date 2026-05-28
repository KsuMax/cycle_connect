-- ============================================================
-- Email-канал уведомлений: настройки пользователя + трекинг доставок.
--
-- Поля настроек живут на profiles, дефолты — true для всех
-- продуктовых категорий (по согласованному поведению: «включено
-- сразу, пользователь сам выключит в настройках»). Дайджест —
-- единственный явный opt-in (default false), чтобы не превращать
-- регистрацию в подписку на рассылку.
--
-- account-канал нельзя выключить — это транзакционные письма
-- (reset password, смена email, отмена события, на которое
-- пользователь записан). Флаг на профиле есть для симметрии и
-- на случай, если когда-нибудь захотим дать «суперопт-аут», но в UI
-- его не показываем.
--
-- email-адрес отдельным полем не храним — берём auth.users.email.
-- ============================================================

alter table public.profiles
  add column if not exists email_notify_account boolean not null default true,
  add column if not exists email_notify_events  boolean not null default true,
  add column if not exists email_notify_routes  boolean not null default true,
  add column if not exists email_notify_clubs   boolean not null default true,
  add column if not exists email_notify_digest  boolean not null default false;


-- ── Таблица доставок ──────────────────────────────────────────
-- Используется и как лог, и как ключ идемпотентности: перед отправкой
-- email-notify проверяет, не было ли уже доставки этого типа для
-- (user_id, related_id) в нужном окне.
--
-- status:
--   queued   — поставлено в очередь, ещё не отправлено
--   sent     — успешно сдано SMTP
--   failed   — SMTP вернул ошибку (см. error)
--   skipped  — не отправлено по правилу (opt-out, debounce, нет email)
--
-- related_id — событие/маршрут/клуб/что угодно, к чему привязано
-- письмо. Полагается на тип в `type`, отдельных FK не делаем,
-- чтобы не каскадить удаления (лог должен переживать удалённые
-- сущности).

create table if not exists public.email_deliveries (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  type        text        not null,
  related_id  uuid,
  status      text        not null check (status in ('queued', 'sent', 'failed', 'skipped')),
  error       text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists email_deliveries_user_type_idx
  on public.email_deliveries (user_id, type, created_at desc);

create index if not exists email_deliveries_related_idx
  on public.email_deliveries (type, related_id, created_at desc)
  where related_id is not null;

alter table public.email_deliveries enable row level security;

-- Пользователь видит только свои доставки (для «истории писем» в UI,
-- если когда-нибудь сделаем).
create policy "email_deliveries_select_own"
  on public.email_deliveries
  for select
  using (auth.uid() = user_id);

-- Пишет только service role (edge-function). Никаких insert-политик
-- для anon/authenticated — это анти-абуз.
