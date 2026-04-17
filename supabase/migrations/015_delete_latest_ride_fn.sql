-- Atomic function to delete the most recent ride for the calling user.
-- route_rides has no surrogate id column, so we use ctid (PostgreSQL physical
-- row pointer) to target exactly one row without deleting all rides on that route.
-- security definer bypasses RLS; auth.uid() WHERE clause keeps it safe.
create or replace function delete_latest_ride(p_route_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctid tid;
begin
  select ctid into v_ctid
  from route_rides
  where user_id = auth.uid()
    and route_id = p_route_id
  order by created_at desc
  limit 1;

  if v_ctid is null then
    return false;
  end if;

  delete from route_rides where ctid = v_ctid;
  return true;
end;
$$;
