-- Migration 0062: Enhance experience_bookings for party size, scheduling, notes, and staff confirmation flow.

alter table experience_bookings add column if not exists guest_count integer not null default 1;
alter table experience_bookings add column if not exists preferred_time text;
alter table experience_bookings add column if not exists scheduled_time text;
alter table experience_bookings add column if not exists notes text;
alter table experience_bookings add column if not exists unit_label text default 'per person';

alter table experience_bookings drop constraint if exists experience_bookings_status_check;
alter table experience_bookings add constraint experience_bookings_status_check
  check (status in ('pending', 'requested', 'confirmed', 'completed', 'cancelled'));

drop policy if exists "staff can manage experience bookings on their property" on experience_bookings;
create policy "staff can manage experience bookings on their property" on experience_bookings
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create or replace function guest_book_experience(
  p_token uuid,
  p_experience_name text,
  p_price numeric default 0,
  p_guest_count integer default 1,
  p_preferred_time text default null,
  p_notes text default null,
  p_unit_label text default 'per person'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_booking experience_bookings%rowtype;
  v_room_number text;
  v_total_price numeric(10, 2);
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  v_total_price := coalesce(p_price, 0) * greatest(coalesce(p_guest_count, 1), 1);

  insert into experience_bookings (
    property_id, reservation_id, experience_name, price, guest_count, preferred_time, notes, unit_label, status
  )
  values (
    v_reservation.property_id, v_reservation.id, trim(p_experience_name), v_total_price,
    greatest(coalesce(p_guest_count, 1), 1), nullif(trim(p_preferred_time), ''), nullif(trim(p_notes), ''),
    coalesce(p_unit_label, 'per person'), 'pending'
  )
  returning * into v_booking;

  select r.number into v_room_number
  from rooms r where r.id = v_reservation.room_id;

  insert into notifications (property_id, type, title, body, room_number, ref_id)
  values (
    v_reservation.property_id, 'guest_request',
    'Experience Reserved — Room ' || coalesce(v_room_number, '?'),
    p_experience_name || ' (' || greatest(coalesce(p_guest_count, 1), 1) || ' guests)',
    v_room_number, v_booking.id
  );

  return jsonb_build_object(
    'id', v_booking.id,
    'experienceName', v_booking.experience_name,
    'totalPrice', v_booking.price,
    'guestCount', v_booking.guest_count,
    'status', v_booking.status
  );
end;
$$;

grant execute on function guest_book_experience(uuid, text, numeric, integer, text, text, text) to authenticated, anon;

create or replace function guest_fetch_experience_bookings(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_result jsonb;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', eb.id,
    'experienceName', eb.experience_name,
    'totalPrice', eb.price,
    'guestCount', eb.guest_count,
    'preferredTime', eb.preferred_time,
    'scheduledTime', eb.scheduled_time,
    'unitLabel', eb.unit_label,
    'notes', eb.notes,
    'status', eb.status,
    'createdAt', eb.created_at
  ) order by eb.created_at desc), '[]'::jsonb)
  into v_result
  from experience_bookings eb
  where eb.reservation_id = v_reservation.id;

  return v_result;
end;
$$;

grant execute on function guest_fetch_experience_bookings(uuid) to authenticated, anon;

create or replace function staff_fetch_experience_bookings(p_property_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', eb.id,
      'reservationId', eb.reservation_id,
      'guestName', coalesce(g.name, 'Guest'),
      'roomNumber', coalesce(r.number, '?'),
      'experienceName', eb.experience_name,
      'totalPrice', eb.price,
      'guestCount', eb.guest_count,
      'preferredTime', eb.preferred_time,
      'scheduledTime', eb.scheduled_time,
      'unitLabel', eb.unit_label,
      'notes', eb.notes,
      'status', eb.status,
      'createdAt', eb.created_at
    ) order by eb.created_at desc)
    from experience_bookings eb
    join reservations res on res.id = eb.reservation_id
    left join guests g on g.id = res.guest_id
    left join rooms r on r.id = res.room_id
    where eb.property_id = p_property_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function staff_fetch_experience_bookings(text) from public;
grant execute on function staff_fetch_experience_bookings(text) to authenticated, anon;

create or replace function staff_confirm_experience_booking(
  p_property_id text,
  p_booking_id uuid,
  p_scheduled_time text,
  p_charge_folio boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking experience_bookings%rowtype;
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;

  select * into v_booking from experience_bookings where id = p_booking_id and property_id = p_property_id;
  if not found then
    raise exception 'Experience booking not found';
  end if;

  update experience_bookings
  set status = 'confirmed', scheduled_time = trim(p_scheduled_time)
  where id = p_booking_id;

  if p_charge_folio and coalesce(v_booking.price, 0) > 0 then
    insert into folio_charges (property_id, reservation_id, description, amount, category)
    values (
      p_property_id, v_booking.reservation_id,
      v_booking.experience_name || ' (' || v_booking.guest_count || ' guests)',
      v_booking.price, 'other'
    );
  end if;
end;
$$;

revoke execute on function staff_confirm_experience_booking(text, uuid, text, boolean) from public;
grant execute on function staff_confirm_experience_booking(text, uuid, text, boolean) to authenticated, anon;

create or replace function staff_cancel_experience_booking(
  p_property_id text,
  p_booking_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;

  update experience_bookings
  set status = 'cancelled', notes = coalesce(nullif(trim(p_reason), ''), notes)
  where id = p_booking_id and property_id = p_property_id;
end;
$$;

revoke execute on function staff_cancel_experience_booking(text, uuid, text) from public;
grant execute on function staff_cancel_experience_booking(text, uuid, text) to authenticated, anon;
