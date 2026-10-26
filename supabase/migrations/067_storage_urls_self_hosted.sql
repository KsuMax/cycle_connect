-- Migration: storage_urls_self_hosted
-- Created: 2026-10-27
-- Description: старые ссылки на файлы указывали на облачный Supabase
-- (https://<project>.supabase.co/storage/...). Файлы давно лежат в
-- self-hosted storage по тем же путям — переписываем ссылки на
-- api.cycleconnect.cc и убираем кеш-бастер ?t=.

update public.route_images
   set url = regexp_replace(split_part(url, '?', 1), '^https://[^/]+\.supabase\.co/', 'https://api.cycleconnect.cc/')
 where url ~ '^https://[^/]+\.supabase\.co/';

update public.routes
   set cover_url = regexp_replace(split_part(cover_url, '?', 1), '^https://[^/]+\.supabase\.co/', 'https://api.cycleconnect.cc/')
 where cover_url ~ '^https://[^/]+\.supabase\.co/';

update public.events
   set cover_url = regexp_replace(split_part(cover_url, '?', 1), '^https://[^/]+\.supabase\.co/', 'https://api.cycleconnect.cc/')
 where cover_url ~ '^https://[^/]+\.supabase\.co/';

update public.clubs
   set avatar_url = regexp_replace(split_part(avatar_url, '?', 1), '^https://[^/]+\.supabase\.co/', 'https://api.cycleconnect.cc/')
 where avatar_url ~ '^https://[^/]+\.supabase\.co/';

update public.clubs
   set cover_url = regexp_replace(split_part(cover_url, '?', 1), '^https://[^/]+\.supabase\.co/', 'https://api.cycleconnect.cc/')
 where cover_url ~ '^https://[^/]+\.supabase\.co/';

update public.profiles
   set avatar_url = regexp_replace(split_part(avatar_url, '?', 1), '^https://[^/]+\.supabase\.co/', 'https://api.cycleconnect.cc/')
 where avatar_url ~ '^https://[^/]+\.supabase\.co/';
