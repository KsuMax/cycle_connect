-- Sprint 1: AI search query log.
--
-- Captures every search for analytics:
--   • What queries users type (including those that return 0 results)
--   • What filters were extracted
--   • How many results came back
--   • Whether the smart fallback (filter relaxation) fired
--
-- This table drives future roadmap work:
--   - Which intents are frequent but unserved → gap analysis
--   - Which filters are consistently extracted wrong → prompt tuning
--   - User-level search history for personalisation v2

create table if not exists public.ai_search_log (
  id           bigint generated always as identity primary key,
  user_id      uuid references auth.users(id) on delete set null,
  query        text        not null,
  parsed_filters jsonb,
  n_results    int         not null default 0,
  entity_type  text        not null default 'routes',
  relaxed      boolean     not null default false,
  ts           timestamptz not null default now()
);

-- Index: per-user history lookup (personalisation v2, suggestions)
create index if not exists ai_search_log_user_ts_idx
  on public.ai_search_log (user_id, ts desc)
  where user_id is not null;

-- Index: time-series analytics (gap analysis, trending queries)
create index if not exists ai_search_log_ts_idx
  on public.ai_search_log (ts desc);

-- Only the service-role key (used by the API route) can insert.
-- Authenticated users have no direct access — this is server-only analytics.
grant insert on public.ai_search_log to service_role;

-- RLS: row-level security on (ensures direct client calls are rejected).
alter table public.ai_search_log enable row level security;
-- No policies → nobody except service_role (which bypasses RLS) can read/write.
