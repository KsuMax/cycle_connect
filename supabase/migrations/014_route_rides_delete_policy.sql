-- Allow users to delete their own ride records.
-- Without this RLS policy the DELETE silently returns 0 rows, leaving the DB
-- unchanged while the client-side cache updates — the mismatch reappears on reload.
create policy "Users can delete their own rides"
  on route_rides for delete
  using (user_id = auth.uid());
