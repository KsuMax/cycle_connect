-- Onboarding flag on profiles.
--
-- When NULL, the user is treated as a brand-new account and the app
-- redirects them to /onboarding before they can use the rest of the site.
-- All existing users are stamped with now() so they don't see the flow.

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

update public.profiles
   set onboarded_at = now()
 where onboarded_at is null;
