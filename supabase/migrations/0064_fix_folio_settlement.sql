-- Migration 0064: Fix Room Folio Settlement & Room Checkout in Reception
-- Ensures staff_checkout_reservation handles all reservation statuses cleanly,
-- preserves pre-recorded payment methods, and provides room-fallback checkout.

create or replace function staff_checkout_reservation(
  p_reservation_id uuid,
  p_payment_method text default 'cash'
)
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
  v_effective_payment_method text;
begin
  select * into v_reservation from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reservation not found';
  end if;

  if not is_staff_for_property(v_reservation.property_id) then
    raise exception 'Not authorized for this property';
  end if;

  v_effective_payment_method := coalesce(nullif(trim(p_payment_method), ''), 'cash');

  -- Locate room row
  if v_reservation.room_id is not null then
    select * into v_room from rooms where id = v_reservation.room_id;
  end if;

  -- Calculate total outstanding unsettled charges
  select coalesce(sum(amount), 0) into v_total
  from folio_charges
  where reservation_id = p_reservation_id and settled_at is null;

  -- Settle all unsettled charges
  update folio_charges
  set settled_at = now(), payment_method = coalesce(payment_method, v_effective_payment_method)
  where reservation_id = p_reservation_id and settled_at is null;

  -- Mark reservation checked_out
  update reservations
  set status = 'checked_out', checked_out_at = coalesce(checked_out_at, now())
  where id = p_reservation_id;

  -- Update room status to dirty and clear guest_token
  if v_reservation.room_id is not null then
    update rooms
    set status = 'dirty', guest_token = null
    where id = v_reservation.room_id;
  end if;

  -- Auto-dispatch cleaning task for Housekeeping
  if v_room.number is not null then
    insert into tasks (
      property_id, room_number, room_label, title, priority, status, category
    )
    values (
      v_reservation.property_id, v_room.number, 'Room ' || v_room.number,
      'Deep Clean Room ' || v_room.number, 'Urgent', 'pending', 'housekeeping'
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
    'reservationId', p_reservation_id,
    'amountCharged', v_total,
    'paymentMethod', v_effective_payment_method
  );
end;
$$;

revoke execute on function staff_checkout_reservation(uuid, text) from public;
grant execute on function staff_checkout_reservation(uuid, text) to authenticated, anon;

-- Room Fallback Checkout: Allows Reception to settle/checkout a room directly by room_id
create or replace function staff_checkout_room(
  p_room_id uuid,
  p_payment_method text default 'cash'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
  v_res_id uuid;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'Room not found';
  end if;

  if not is_staff_for_property(v_room.property_id) then
    raise exception 'Not authorized for this property';
  end if;

  -- Find active or most recent reservation for this room
  select id into v_res_id
  from reservations
  where room_id = p_room_id
  order by (case when status = 'checked_in' then 1 else 2 end), created_at desc
  limit 1;

  if v_res_id is not null then
    return staff_checkout_reservation(v_res_id, p_payment_method);
  else
    -- Direct room status override if no reservation row exists
    update rooms set status = 'dirty', guest_token = null where id = p_room_id;
    return jsonb_build_object('roomId', p_room_id, 'amountCharged', 0, 'paymentMethod', coalesce(p_payment_method, 'cash'));
  end if;
end;
$$;

revoke execute on function staff_checkout_room(uuid, text) from public;
grant execute on function staff_checkout_room(uuid, text) to authenticated, anon;
