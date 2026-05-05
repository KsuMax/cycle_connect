-- Allow the event organizer to delete announcements they posted.

create policy "organizer can delete announcements"
  on public.event_announcements for delete
  using (
    exists (
      select 1 from public.events e
      where e.id = event_announcements.event_id
        and e.organizer_id = auth.uid()
    )
  );
