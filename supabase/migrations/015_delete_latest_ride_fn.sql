-- Atomic function to delete the most recent ride for the calling user.
-- Uses security definer so it bypasses RLS entirely while still scoping
-- by auth.uid() — safe because the WHERE clause restricts to the caller's rows.
create or replace function delete_latest_ride(p_route_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride_id uuid;
begin
  select id into v_ride_id
  from route_rides
  where user_id = auth.uid()
    and route_id = p_route_id
  order by created_at desc
  limit 1;

  if v_ride_id is null then
    return false;
  end if;

  delete from route_rides where id = v_ride_id;
  return true;
end;
$$;
