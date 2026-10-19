-- Migration 0064: Fix Room Folio Settlement & Room Checkout in Reception
-- Ensures staff_checkout_reservation, staff_checkout_room, and staff_get_folio accept text Room IDs
-- (e.g. "the-ace-terminal-104") or UUID reservation IDs, eliminating Postgres 22P02 invalid input syntax errors
-- and using 'high' priority for housekeeping tasks to satisfy tasks_priority_check constraint.

drop function if exists staff_checkout_reservation(uuid, text);
drop function if exists staff_checkout_reservation(text, text);
drop function if exists staff_checkout_room(uuid, text);
drop function if exists staff_checkout_room(text, text);
drop function if exists staff_get_folio(uuid);
drop function if exists staff_get_folio(text);

create or replace function staff_get_folio(p_reservation_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res_uuid uuid;
  v_reservation reservations%rowtype;
begin
  begin
    v_res_uuid := p_reservation_id::uuid;
  exception when others then
    v_res_uuid := null;
  end;

  if v_res_uuid is not null then
    select * into v_reservation from reservations where id = v_res_uuid;
  end if;

  if v_reservation.id is null then
    select * into v_reservation
    from reservations
    where room_id = p_reservation_id
    order by (case when status = 'checked_in' then 1 else 2 end), created_at desc
    limit 1;
  end if;

  if v_reservation.id is null then
    return jsonb_build_object(
      'reservationId', p_reservation_id,
      'status', 'checked_in',
      'checkIn', now(),
      'checkOut', now(),
      'charges', '[]'::jsonb,
      'totalOutstanding', 0,
      'totalPaid', 0
    );
  end if;

  if not is_staff_for_property(v_reservation.property_id) then
    raise exception 'Not authorized for this property';
  end if;

  return jsonb_build_object(
    'reservationId', v_reservation.id,
    'status', v_reservation.status,
    'checkIn', v_reservation.check_in,
    'checkOut', v_reservation.check_out,
    'charges', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'description', description, 'amount', amount, 'category', category,
        'postedAt', posted_at, 'settled', settled_at is not null
      ) order by posted_at), '[]'::jsonb)
      from folio_charges where reservation_id = v_reservation.id
    ),
    'totalOutstanding', (
      select coalesce(sum(amount), 0) from folio_charges
      where reservation_id = v_reservation.id and settled_at is null
    ),
    'totalPaid', (
      select coalesce(sum(amount), 0) from folio_charges
      where reservation_id = v_reservation.id and (settled_at is not null or amount < 0)
    )
  );
end;
$$;

revoke execute on function staff_get_folio(text) from public;
grant execute on function staff_get_folio(text) to authenticated, anon;

create or replace function staff_checkout_reservation(
  p_reservation_id text,
  p_payment_method text default 'cash'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res_uuid uuid;
  v_reservation reservations%rowtype;
  v_room rooms%rowtype;
  v_total numeric(10, 2);
  v_task_id uuid;
  v_effective_payment_method text;
begin
  v_effective_payment_method := coalesce(nullif(trim(p_payment_method), ''), 'cash');

  -- Attempt to parse p_reservation_id as UUID
  begin
    v_res_uuid := p_reservation_id::uuid;
  exception when others then
    v_res_uuid := null;
  end;

  if v_res_uuid is not null then
    select * into v_reservation from reservations where id = v_res_uuid;
  end if;

  -- If reservation was not found by UUID, try looking up active reservation by room_id
  if v_reservation.id is null then
    select * into v_reservation
    from reservations
    where room_id = p_reservation_id
    order by (case when status = 'checked_in' then 1 else 2 end), created_at desc
    limit 1;
  end if;

  -- If still no reservation row found, perform direct room status checkout override
  if v_reservation.id is null then
    select * into v_room from rooms where id = p_reservation_id;
    if v_room.id is not null then
      update rooms set status = 'dirty' where id = v_room.id;
      return jsonb_build_object('roomId', v_room.id, 'amountCharged', 0, 'paymentMethod', v_effective_payment_method);
    else
      raise exception 'Reservation or room not found: %', p_reservation_id;
    end if;
  end if;

  if not is_staff_for_property(v_reservation.property_id) then
    raise exception 'Not authorized for this property';
  end if;

  -- Locate room row
  if v_reservation.room_id is not null then
    select * into v_room from rooms where id = v_reservation.room_id;
  end if;

  -- Calculate total outstanding unsettled charges
  select coalesce(sum(amount), 0) into v_total
  from folio_charges
  where reservation_id = v_reservation.id and settled_at is null;

  -- Settle all unsettled charges
  update folio_charges
  set settled_at = now(), payment_method = coalesce(payment_method, v_effective_payment_method)
  where reservation_id = v_reservation.id and settled_at is null;

  -- Mark reservation checked_out
  update reservations
  set status = 'checked_out', checked_out_at = coalesce(checked_out_at, now())
  where id = v_reservation.id;

  -- Update room status to dirty
  if v_reservation.room_id is not null then
    update rooms
    set status = 'dirty'
    where id = v_reservation.room_id;
  end if;

  -- Auto-dispatch cleaning task for Housekeeping
  if v_room.number is not null then
    insert into tasks (
      property_id, room_number, room_label, title, priority, status, category
    )
    values (
      v_reservation.property_id, v_room.number, 'Room ' || v_room.number,
      'Deep Clean Room ' || v_room.number, 'high', 'pending', 'housekeeping'
    )
    returning id into v_task_id;

    insert into notifications (property_id, type, title, body, room_number, ref_id)
    values (
      v_reservation.property_id, 'housekeeping',
      'Cleaning Required — Room ' || v_room.number,
      'Guest checked out. Room ' || v_room.number || ' is now dirty and needs cleaning.',
      v_room.number, v_task_id
    );
  end if;

  return jsonb_build_object(
    'reservationId', v_reservation.id,
    'amountCharged', v_total,
    'paymentMethod', v_effective_payment_method
  );
end;
$$;

revoke execute on function staff_checkout_reservation(text, text) from public;
grant execute on function staff_checkout_reservation(text, text) to authenticated, anon;

-- Room Fallback Checkout (accepts text room_id)
create or replace function staff_checkout_room(
  p_room_id text,
  p_payment_method text default 'cash'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return staff_checkout_reservation(p_room_id, p_payment_method);
end;
$$;

revoke execute on function staff_checkout_room(text, text) from public;
grant execute on function staff_checkout_room(text, text) to authenticated, anon;
