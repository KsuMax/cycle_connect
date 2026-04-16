-- Sprint 2, step 3: Telegram bot integration.
--
-- profiles.telegram_chat_id  — bigint; set by the bot on /start <code>.
--                               Used to send notifications.
-- profiles.tg_link_code       — short-lived one-time code for linking.
-- profiles.tg_link_code_exp   — expiry timestamp (10 min window).
-- profiles.tg_notify_intents  — user can opt out of intent notifications.

alter table public.profiles
  add column if not exists telegram_chat_id    bigint,
  add column if not exists tg_link_code        text,
  add column if not exists tg_link_code_exp    timestamptz,
  add column if not exists tg_notify_intents   boolean not null default true;

-- Index for webhook handler: look up a code quickly.
create index if not exists profiles_tg_link_code_idx
  on public.profiles (tg_link_code)
  where tg_link_code is not null;

-- The webhook edge function runs with the service role, but we still add a
-- policy so regular RLS calls can't read chat_ids that belong to other users.
-- (The service role bypasses RLS — this is just defence-in-depth.)
create policy "users can see their own tg fields"
  on public.profiles
  for select
  using ( auth.uid() = id );
