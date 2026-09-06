-- Real availability search + advance (future-dated) bookings + cancellation.
--
-- Until now, "available" meant "room.status = 'ready' right now" — fine for
-- a walk-in, wrong for "the guest is arriving next Monday": a room that's
-- occupied *today* can still be free next Monday, and a room that's
-- 'ready' today might already have a future reservation on it. Real
-- availability has to be a date-range overlap check against reservations,
-- independent of the room's current status. Apply after 0001-0014.

-- Every ready-to-move-in-or-will-be-by-then room whose [check_in, check_out)
-- window doesn't overlap any other *active* (upcoming/checked_in)
-- reservation. SECURITY INVOKER — RLS on rooms/reservations already scopes
-- this to the caller's own properties.
create or replace function staff_search_available_rooms(
  p_property_id text,
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_min_occupancy int default 1,
  p_room_type text default null
)
returns jsonb
language plpgsql
stable
as $$
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Checkout must be after check-in';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'number', r.number, 'type', r.type, 'floor', r.floor,
      'maxOccupancy', r.max_occupancy, 'pricePerNight', r.price_per_night, 'image', r.image
    ) order by r.price_per_night)
    from rooms r
    where r.property_id = p_property_id
      and r.status <> 'maintenance'
      and r.max_occupancy >= greatest(coalesce(p_min_occupancy, 1), 1)
      and (p_room_type is null or r.type = p_room_type)
      and not exists (
        select 1 from reservations res
        where res.room_id = r.id
          and res.status in ('upcoming', 'checked_in')
          and res.check_in < p_check_out
          and res.check_out > p_check_in
      )
  ), '[]'::jsonb);
end;
$$;

revoke execute on function staff_search_available_rooms(text, timestamptz, timestamptz, int, text) from public;
grant execute on function staff_search_available_rooms(text, timestamptz, timestamptz, int, text) to authenticated;

-- staff_checkin_new_guest gains a real check-in date instead of always
-- assuming "right now": a walk-in still checks straight in and occupies
-- the room, but a future date creates the reservation as 'upcoming'
-- (staff_check_in_reservation, 0002_room_ops.sql, is what actually checks
-- them in later) and never touches the room's current status. Availability
-- is re-verified server-side either way — the search above is what the UI
-- shows, but this is what actually prevents a double-booking race.
drop function if exists staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, int);

create or replace function staff_checkin_new_guest(
  p_property_id text,
  p_room_id text,
  p_guest_name text,
  p_guest_phone text default null,
  p_guest_email text default null,
  p_guest_vip boolean default false,
  p_id_document_url text default null,
  p_check_out timestamptz default null,
  p_party_size int default 1,
  p_check_in timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
  v_guest_id uuid;
  v_reservation_id uuid;
  v_check_in timestamptz := coalesce(p_check_in, now());
  v_check_out timestamptz := coalesce(p_check_out, v_check_in + interval '1 day');
  v_is_immediate boolean := v_check_in <= now();
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_guest_name is null or length(trim(p_guest_name)) = 0 then
    raise exception 'Guest name is required';
  end if;
  if v_check_out <= v_check_in then
    raise exception 'Checkout must be after check-in';
  end if;

  select * into v_room from rooms where id = p_room_id and property_id = p_property_id;
  if not found then
    raise exception 'Room not found on this property';
  end if;
  if v_room.status = 'maintenance' then
    raise exception 'Room % is under maintenance', v_room.number;
  end if;
  if v_is_immediate and v_room.status not in ('ready', 'dirty', 'cleaning') then
    raise exception 'Room % is not available to check in right now (status: %)', v_room.number, v_room.status;
  end if;

  -- The authoritative guard against double-booking — re-checked here even
  -- though the UI already searched with staff_search_available_rooms,
  -- since two receptionists could be booking the same room at once.
  if exists (
    select 1 from reservations res
    where res.room_id = p_room_id
      and res.status in ('upcoming', 'checked_in')
      and res.check_in < v_check_out
      and res.check_out > v_check_in
  ) then
    raise exception 'Room % already has a booking overlapping that date range', v_room.number;
  end if;

  insert into guests (name, email, phone, vip, id_document_url)
  values (trim(p_guest_name), nullif(trim(p_guest_email), ''), nullif(trim(p_guest_phone), ''), coalesce(p_guest_vip, false), nullif(trim(p_id_document_url), ''))
  returning id into v_guest_id;

  insert into reservations (property_id, room_id, guest_id, check_in, check_out, party_size, status, source)
  values (
    p_property_id, p_room_id, v_guest_id, v_check_in, v_check_out,
    greatest(coalesce(p_party_size, 1), 1),
    case when v_is_immediate then 'checked_in' else 'upcoming' end,
    'built_in'
  )
  returning id into v_reservation_id;

  if v_is_immediate then
    update rooms set status = case when coalesce(p_guest_vip, false) then 'occupied_vip' else 'occupied' end
      where id = p_room_id;
  end if;

  return v_reservation_id;
end;
$$;

revoke execute on function staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, int, timestamptz) from public;
grant execute on function staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, int, timestamptz) to authenticated;

-- Cancelling a future booking that never happened — distinct from
-- checkout, which is for a stay that actually occurred. Only 'upcoming'
-- reservations are cancellable this way; a checked-in guest is settled via
-- staff_checkout_reservation instead.
create or replace function staff_cancel_reservation(p_reservation_id uuid)
returns void
language plpgsql
as $$
declare
  v_reservation reservations%rowtype;
begin
  select * into v_reservation from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reservation not found';
  end if;
  if not is_staff_for_property(v_reservation.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_reservation.status <> 'upcoming' then
    raise exception 'Only an upcoming (not yet arrived) booking can be cancelled this way';
  end if;

  update reservations set status = 'cancelled' where id = p_reservation_id;
end;
$$;

grant execute on function staff_cancel_reservation(uuid) to authenticated;
