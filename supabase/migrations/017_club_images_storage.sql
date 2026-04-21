-- Storage policies for club images in the existing 'avatars' bucket.
-- Club images are uploaded to: clubs/{club_id}/avatar.{ext}
--                               clubs/{club_id}/cover.{ext}
--
-- The existing "Upload own avatar" policy only allows paths where the first
-- folder segment matches auth.uid(). Club paths start with "clubs/", so we
-- need separate policies for owners/admins.

create policy "club_admins_insert_avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'clubs'
    and exists (
      select 1 from public.club_members
      where club_id  = ((storage.foldername(name))[2])::uuid
        and user_id  = auth.uid()
        and role    in ('owner', 'admin')
        and status   = 'active'
    )
  );

create policy "club_admins_update_avatars"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'clubs'
    and exists (
      select 1 from public.club_members
      where club_id  = ((storage.foldername(name))[2])::uuid
        and user_id  = auth.uid()
        and role    in ('owner', 'admin')
        and status   = 'active'
    )
  );
