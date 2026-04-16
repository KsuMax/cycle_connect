-- Sprint 2, step 1: contact fields on profiles.
--
-- telegram_username  — e.g. "ksumax" (stored WITHOUT leading "@")
-- contact_email      — optional override for the login e-mail (shown only if email_public)
-- email_public       — explicit opt-in; default false (DON'T leak login emails)

alter table public.profiles
  add column if not exists telegram_username text,
  add column if not exists contact_email     text,
  add column if not exists email_public      boolean not null default false;

-- Light validation: TG usernames are 5-32 chars of [A-Za-z0-9_], with no @.
-- Allow null; allow empty-string coerced to null via app layer.
alter table public.profiles
  drop constraint if exists profiles_telegram_username_fmt;
alter table public.profiles
  add  constraint profiles_telegram_username_fmt
  check (telegram_username is null
         or telegram_username ~ '^[A-Za-z0-9_]{5,32}$');

-- Basic email shape check (permissive, real validation lives in Supabase auth).
alter table public.profiles
  drop constraint if exists profiles_contact_email_fmt;
alter table public.profiles
  add  constraint profiles_contact_email_fmt
  check (contact_email is null
         or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
