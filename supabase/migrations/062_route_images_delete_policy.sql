-- Allow a route's author to delete its photos.
--
-- `route_images` and the `route-images` storage bucket predate the tracked
-- migrations (base schema), and — like route_rides before migration 014 —
-- were created with select/insert policies but NO delete policy. Without it a
-- client-side DELETE silently returns 0 rows: the edit form drops the photo
-- from local state, but on reload it reappears. This mirrors the fix in
-- 014_route_rides_delete_policy.sql and the route_gpx storage policy in 011.

-- 1. Table row: author of the parent route may delete image records.
drop policy if exists "route_images_delete" on route_images;
create policy "route_images_delete"
  on route_images for delete
  using (
    exists (
      select 1 from routes r
      where r.id = route_images.route_id
        and r.author_id = auth.uid()
    )
  );

-- 2. Storage object: files live under <route_id>/... — author may delete them.
drop policy if exists "route_images_delete" on storage.objects;
create policy "route_images_delete"
  on storage.objects for delete
  using (
    bucket_id = 'route-images'
    and exists (
      select 1 from routes r
      where r.id::text = split_part(name, '/', 1)
        and r.author_id = auth.uid()
    )
  );
