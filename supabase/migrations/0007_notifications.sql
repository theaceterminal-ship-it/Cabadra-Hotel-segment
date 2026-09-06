-- In-app notifications: Reception/Owner shouldn't have to be staring at a
-- screen to know a guest just placed an order or asked for something.
-- These rows are written by triggers (never by a client insert — the
-- surface staff get is read + mark-as-read only) and pushed live over
-- Supabase Realtime. Apply after 0001-0006.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  type text not null check (type in ('new_order', 'guest_request', 'high_priority_request', 'task_created', 'new_arrival')),
  title text not null,
  body text not null default '',
  room_number text,
  ref_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table notifications enable row level security;

create index idx_notifications_property on notifications(property_id, created_at desc);
create index idx_notifications_unread on notifications(property_id) where read_at is null;

create policy "staff can view notifications on their property" on notifications
  for select using (is_staff_for_property(property_id));

-- Marking read is the only client-side write this table allows, and only to
-- read_at — the with check clause blocks a staff member from smuggling in
-- a fabricated notification via update-into-a-new-row tricks (Postgres RLS
-- update policies re-check `with check` against the resulting row).
create policy "staff can mark their property's notifications read" on notifications
  for update using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

-- Deliberately no insert/delete policy for anyone — every row here comes
-- from a trigger below, running as this migration's owner, which (like
-- every SECURITY DEFINER function in this schema) bypasses RLS as the
-- table owner. That's the whole point: staff can't post their own
-- notifications, only see the system's.

create or replace function notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_number text;
begin
  select number into v_room_number from rooms where id = new.room_id;
  insert into notifications (property_id, type, title, body, room_number, ref_id)
  values (new.property_id, 'new_order', 'New order — Room ' || coalesce(v_room_number, '?'),
          '$' || new.total_amount || ' · ' || jsonb_array_length(new.items) || ' item(s)', v_room_number, new.id);
  return new;
end;
$$;

drop trigger if exists trg_notify_new_order on orders;
create trigger trg_notify_new_order after insert on orders
  for each row execute function notify_new_order();

create or replace function notify_guest_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (property_id, type, title, body, room_number, ref_id)
  values (
    new.property_id,
    case when new.priority = 'High Priority' then 'high_priority_request' else 'guest_request' end,
    new.title,
    'Room ' || new.room_number || ' · ' || new.priority,
    new.room_number,
    new.id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_guest_request on guest_requests;
create trigger trg_notify_guest_request after insert on guest_requests
  for each row execute function notify_guest_request();

-- Realtime only pushes postgres_changes for tables explicitly added to this
-- publication — without this line, useNotifications' subscription would
-- sit there connected but silent.
alter publication supabase_realtime add table notifications;

create or replace function staff_mark_notification_read(p_notification_id uuid)
returns void
language sql
as $$
  update notifications set read_at = now() where id = p_notification_id;
$$;

grant execute on function staff_mark_notification_read(uuid) to authenticated;

create or replace function staff_mark_all_notifications_read(p_property_id text)
returns void
language plpgsql
as $$
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  update notifications set read_at = now() where property_id = p_property_id and read_at is null;
end;
$$;

grant execute on function staff_mark_all_notifications_read(text) to authenticated;
