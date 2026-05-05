-- Telegram login flow.
--
-- The browser asks /api/auth/tg/start for a nonce, opens t.me/<bot>?start=login_<nonce>,
-- and polls /api/auth/tg/poll. The bot's webhook flips status to 'ready' with user_id
-- (existing profile by telegram_chat_id, or freshly created auth.user). The poll then
-- mints a magiclink and marks the row 'consumed'.
--
-- Service role only — no RLS policies needed (table is never touched by anon clients).

create table if not exists public.tg_login_nonces (
  nonce       text primary key,
  status      text not null default 'pending'
              check (status in ('pending', 'ready', 'consumed')),
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists tg_login_nonces_expires_at_idx
  on public.tg_login_nonces (expires_at);

alter table public.tg_login_nonces enable row level security;
