-- PMS mode: the seam that lets Cabadra be either (a) a guest-experience
-- layer on top of a hotel's existing front-desk software, or (b) a
-- complete built-in front desk for a hotel that doesn't have one. Both
-- modes share every table after `reservations` exists — rooms, folio,
-- orders, service requests, Live Ops, the guest app — none of that cares
-- how the reservation got there.
--
-- One flag flips the mode: has_external_pms. Off (default) = Cabadra's
-- own New Booking / availability-search flow is Reception's front desk,
-- same as today. On = that flow is hidden entirely, because the real PMS
-- already owns booking and availability — Reception's only job becomes
-- tapping a room and typing the guest's name so the room's QR resolves to
-- a real person (staff_checkin_new_guest, unchanged either way). This is
-- intentionally the entire integration surface for now: no API sync yet,
-- just "who's in this room" recorded by hand until a real PMS connector
-- exists to do it automatically.
--
-- reservations.source (0001_init.sql) already distinguishes how a
-- reservation was created; this migration just adds the 'imported' value
-- so PMS-mode check-ins are visibly different from Cabadra's own bookings
-- in any future reporting, without changing behavior today.
alter table properties
  add column if not exists has_external_pms boolean not null default false;

comment on column properties.has_external_pms is
  'true = this hotel already runs its own PMS for bookings/availability; Cabadra hides its own New Booking flow and Reception just links a guest to a room. false = Cabadra is the front desk.';

-- staff_checkin_new_guest gains an optional trailing p_source so a
-- PMS-mode check-in can record source = 'imported' instead of the
-- default 'built_in', without touching anything about how check-in
-- itself works. Existing callers (all named-argument RPC calls) are
-- unaffected by the new value once resolved — but the drop below is
-- required regardless: adding a parameter changes the function's
-- signature, so `create or replace` alone would leave the old 10-arg
-- version standing as a second overload rather than replacing it.
drop function if exists staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, int, timestamptz);

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
  p_check_in timestamptz default now(),
  p_source text default 'built_in'
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
  v_source text := case when p_source in ('built_in', 'imported') then p_source else 'built_in' end;
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
    v_source
  )
  returning id into v_reservation_id;

  if v_is_immediate then
    update rooms set status = case when coalesce(p_guest_vip, false) then 'occupied_vip' else 'occupied' end
      where id = p_room_id;
  end if;

  return v_reservation_id;
end;
$$;

revoke execute on function staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, int, timestamptz, text) from public;
grant execute on function staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, int, timestamptz, text) to authenticated;
