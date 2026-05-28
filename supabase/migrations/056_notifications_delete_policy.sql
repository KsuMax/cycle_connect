-- Allow users to delete their own notifications (in-app "clear")
create policy "notifications_delete" on notifications for delete
  using (auth.uid() = user_id);
