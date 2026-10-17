-- Migration 0063: Automated Housekeeping Workflow on Checkout & Task Status Changes.
-- 1. Checkout automatically marks room 'dirty', creates a Housekeeping task, and sends a notification.
-- 2. Accepting/starting the task ('in_progress') automatically updates room status to 'cleaning'.
-- 3. Marking task 'completed' automatically updates room status to 'ready'.

-- Add room_number column to tasks if missing
alter table tasks add column if not exists room_number text;

-- Update staff_checkout_reservation to auto-dispatch cleaning task & notification
create or replace function staff_checkout_reservation(p_reservation_id uuid, p_payment_method text default 'cash')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_room rooms%rowtype;
  v_total numeric(10, 2);
  v_task_id uuid;
begin
  select * into v_reservation from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reservation not found';
  end if;

  if not is_staff_for_property(v_reservation.property_id) then
    raise exception 'Not authorized for this property';
  end if;

  if v_reservation.status <> 'checked_in' then
    raise exception 'Reservation is not currently checked in';
  end if;

  if p_payment_method not in ('cash', 'card', 'upi', 'other') then
    raise exception 'Invalid payment method: %', p_payment_method;
  end if;

  select * into v_room from rooms where id = v_reservation.room_id;

  select coalesce(sum(amount), 0) into v_total
  from folio_charges where reservation_id = p_reservation_id and settled_at is null;

  update folio_charges set settled_at = now(), payment_method = p_payment_method
  where reservation_id = p_reservation_id and settled_at is null;

  update reservations set status = 'checked_out', checked_out_at = now()
  where id = p_reservation_id;

  -- 1. Room status moves to 'dirty'
  update rooms set status = 'dirty' where id = v_reservation.room_id;

  -- 2. Automatically dispatch cleaning task for Housekeeping
  if v_room.number is not null then
    insert into tasks (
      property_id, room_number, room_label, title, priority, status, category
    )
    values (
      v_reservation.property_id, v_room.number, 'Room ' || v_room.number,
      'Deep Clean Room ' || v_room.number, 'Urgent', 'pending', 'housekeeping'
    )
    returning id into v_task_id;

    -- 3. Notify Housekeeping department
    insert into notifications (property_id, type, title, body, room_number, ref_id)
    values (
      v_reservation.property_id, 'housekeeping',
      'Cleaning Required — Room ' || v_room.number,
      'Guest checked out. Room ' || v_room.number || ' is now dirty and needs cleaning.',
      v_room.number, v_task_id
    );
  end if;

  return jsonb_build_object('reservationId', p_reservation_id, 'amountCharged', v_total, 'paymentMethod', p_payment_method);
end;
$$;

revoke execute on function staff_checkout_reservation(uuid, text) from public;
grant execute on function staff_checkout_reservation(uuid, text) to authenticated;

-- Trigger function to automatically update room status based on task lifecycle
create or replace function trg_sync_housekeeping_room_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_num text;
begin
  -- Extract digits/room number from room_number or room_label
  v_room_num := coalesce(
    nullif(trim(NEW.room_number), ''),
    nullif(regexp_replace(NEW.room_label, '[^0-9]', '', 'g'), '')
  );

  if v_room_num is not null and length(v_room_num) > 0 then
    -- If housekeeping task or cleaning title
    if NEW.category = 'housekeeping' or lower(NEW.title) like '%clean%' then

      -- State 1: Task started ('in_progress') -> Room becomes 'cleaning'
      if NEW.status = 'in_progress' and (OLD.status is null or OLD.status <> 'in_progress') then
        update rooms
        set status = 'cleaning'
        where property_id = NEW.property_id
          and number = v_room_num
          and status in ('dirty', 'ready', 'cleaning');

      -- State 2: Task completed ('completed') -> Room becomes 'ready'
      elsif NEW.status = 'completed' and (OLD.status is null or OLD.status <> 'completed') then
        update rooms
        set status = 'ready', clean_progress = 100
        where property_id = NEW.property_id
          and number = v_room_num
          and status in ('cleaning', 'dirty', 'ready');

      end if;

    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_housekeeping_room_status_sync on tasks;
create trigger trg_housekeeping_room_status_sync
  after insert or update on tasks
  for each row
  execute function trg_sync_housekeeping_room_status();
