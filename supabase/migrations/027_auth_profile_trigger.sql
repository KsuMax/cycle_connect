-- Auto-create a row in public.profiles whenever a user registers in auth.users.
--
-- Background: production has 20 rows in auth.users but only 18 in public.profiles
-- because no on-signup trigger existed. Without a profile row:
--   • the user is invisible on /users (RLS is fine, they just don't exist there);
--   • events page filters them out of the participants list (join profile=null),
--     so "Я поеду" appears to do nothing even when the INSERT succeeds.
--
-- This migration:
--   1. Creates handle_new_user() — SECURITY DEFINER so it can write profiles
--      regardless of the caller's role (the auth admin role would otherwise hit RLS).
--   2. Hooks it to AFTER INSERT on auth.users.
--   3. Backfills profiles for any auth.users without one.
-- All steps are idempotent.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_name text;
begin
  derived_name := coalesce(
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'user_name', ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Велосипедист'
  );

  insert into public.profiles (
    id,
    name,
    avatar_url,
    created_at
  )
  values (
    new.id,
    derived_name,
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    coalesce(new.created_at, now())
  )
  on conflict (id) do nothing;

  return new;
exception when others then
  -- Never block signup because of a profile-row hiccup; just log it.
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- (Re)create the trigger on auth.users.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Backfill: create rows for users registered before the trigger existed ──
insert into public.profiles (
  id,
  name,
  avatar_url,
  created_at
)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'name', ''),
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'user_name', ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'Велосипедист'
  ),
  nullif(u.raw_user_meta_data->>'avatar_url', ''),
  coalesce(u.created_at, now())
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
