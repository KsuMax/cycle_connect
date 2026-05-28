-- Helper for email-notify edge function.
-- PostgREST does not expose the auth schema, so the edge function cannot
-- query auth.users directly via adminDb.schema("auth").from("users").
-- This SECURITY DEFINER function bridges the gap: it runs as the owner
-- (postgres) and can access auth.users regardless of PostgREST config.
-- Only service_role is granted execute; anon/authenticated are revoked.

create or replace function public.get_user_emails(user_ids uuid[])
returns table(id uuid, email text)
language sql
security definer
set search_path = public
as $$
  select id, email::text
  from auth.users
  where id = any(user_ids)
    and email is not null;
$$;

revoke all on function public.get_user_emails(uuid[]) from anon, authenticated;
grant execute on function public.get_user_emails(uuid[]) to service_role;
