-- ============================================================
-- In-app уведомления для заявок в клуб.
--
-- Три триггера:
--  1. Пользователь подал заявку (status='pending') →
--     in-app для всех owners/admins клуба.
--  2. Заявку одобрили (status: pending→active) →
--     in-app для заявителя.
--  3. Заявку отклонили (DELETE из club_members, где было pending) →
--     in-app для заявителя.
--
-- Email уже отправляется клиентским кодом (clubs/[slug]/page.tsx).
-- Здесь только in-app уведомления в таблицу notifications.
-- ============================================================

-- ── 1. Новая заявка → уведомить owners/admins ─────────────────

create or replace function public.notify_club_admins_on_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Только заявки (pending), не мгновенные вступления (active)
  if new.status <> 'pending' then
    return new;
  end if;

  insert into public.notifications (user_id, type, actor_id, data)
  select
    cm.user_id,
    'club_join_request',
    new.user_id,
    jsonb_build_object(
      'club_id',   new.club_id,
      'club_slug', c.slug,
      'club_name', c.name
    )
  from public.club_members cm
  join public.clubs c on c.id = new.club_id
  where cm.club_id  = new.club_id
    and cm.status   = 'active'
    and cm.role     in ('owner', 'admin')
    and cm.user_id != new.user_id;

  return new;
end;
$$;

create trigger on_club_join_request
  after insert on public.club_members
  for each row
  execute function public.notify_club_admins_on_join_request();


-- ── 2. Заявку одобрили → уведомить заявителя ─────────────────

create or replace function public.notify_member_on_club_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Только переход pending → active
  if old.status = 'pending' and new.status = 'active' then
    insert into public.notifications (user_id, type, actor_id, data)
    select
      new.user_id,
      'club_join_approved',
      new.user_id,   -- actor = сам пользователь (admins не имеют своего id здесь)
      jsonb_build_object(
        'club_id',   new.club_id,
        'club_slug', c.slug,
        'club_name', c.name
      )
    from public.clubs c
    where c.id = new.club_id;
  end if;

  return new;
end;
$$;

create trigger on_club_member_approved
  after update on public.club_members
  for each row
  execute function public.notify_member_on_club_approval();


-- ── 3. Заявку отклонили → уведомить заявителя ────────────────

create or replace function public.notify_member_on_club_rejection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Срабатывает только если удаляли pending-заявку (не активного члена)
  if old.status <> 'pending' then
    return old;
  end if;

  insert into public.notifications (user_id, type, actor_id, data)
  select
    old.user_id,
    'club_join_rejected',
    old.user_id,
    jsonb_build_object(
      'club_id',   old.club_id,
      'club_slug', c.slug,
      'club_name', c.name
    )
  from public.clubs c
  where c.id = old.club_id;

  return old;
end;
$$;

create trigger on_club_member_rejected
  after delete on public.club_members
  for each row
  execute function public.notify_member_on_club_rejection();
