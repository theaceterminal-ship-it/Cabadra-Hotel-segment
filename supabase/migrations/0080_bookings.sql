-- Standalone PMS, phase 2: bookings.
--
-- What the front desk needs to run reservations without another PMS:
--   * every booking gets a short reference (B7K2QX) to quote on the phone,
--     where it came from (walk-in, phone, email, website, OTA, agent) and
--     notes;
--   * a bookings list for a date window, or a search by name, phone,
--     reference or room, which drives both the calendar and the list;
--   * changing a booking: dates, room, rate, number of guests, the guest's
--     details. For a guest already in house that means extending or
--     shortening the stay and moving rooms; the room left is marked dirty
--     and gets a cleaning task. Every change re-checks that the room is
--     free and not under maintenance;
--   * cancelling (with an optional fee) and marking a no-show (with an
--     optional charge); either can then be closed with a numbered bill once
--     its balance is zero, refunds included;
--   * early check-in moves the arrival to now, so room nights start from
--     the night the guest actually stays.
-- Apply after 0001-0079.

alter table reservations drop constraint if exists reservations_status_check;
alter table reservations add constraint reservations_status_check
  check (status in ('upcoming', 'checked_in', 'checked_out', 'cancelled', 'no_show'));

alter table reservations
  add column if not exists booking_ref text,
  add column if not exists notes text,
  add column if not exists channel text not null default 'walk_in',
  add column if not exists channel_detail text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_channel_check') then
    alter table reservations add constraint reservations_channel_check
      check (channel in ('walk_in', 'phone', 'email', 'website', 'ota', 'agent', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservations_text_lengths') then
    alter table reservations add constraint reservations_text_lengths
      check (length(notes) <= 1000 and length(channel_detail) <= 60 and length(cancel_reason) <= 300);
  end if;
end $$;

-- Six characters from an alphabet without look-alikes (no 0/O, 1/I).
create or replace function new_booking_ref()
returns text
language sql
volatile
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

create or replace function reservations_assign_ref()
returns trigger
language plpgsql
as $$
begin
  if new.booking_ref is null then
    loop
      new.booking_ref := new_booking_ref();
      exit when not exists (select 1 from reservations where property_id = new.property_id and booking_ref = new.booking_ref);
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists reservations_assign_ref on reservations;
create trigger reservations_assign_ref before insert on reservations
for each row execute function reservations_assign_ref();

do $$
declare
  v_id uuid;
begin
  for v_id in select id from reservations where booking_ref is null loop
    update reservations r set booking_ref = x.ref
    from (select new_booking_ref() as ref) x
    where r.id = v_id
      and not exists (select 1 from reservations o where o.property_id = r.property_id and o.booking_ref = x.ref);
  end loop;
end $$;
create unique index if not exists reservations_property_ref on reservations (property_id, booking_ref);

-- Arrival 2 pm and departure noon, Indian time, for bookings made by date.
create or replace function stay_start(p_date date)
returns timestamptz
language sql
immutable
as $$ select (p_date + time '14:00') at time zone 'Asia/Kolkata'; $$;

create or replace function stay_end(p_date date)
returns timestamptz
language sql
immutable
as $$ select (p_date + time '12:00') at time zone 'Asia/Kolkata'; $$;

-- Whether a room is free for a window, ignoring one booking (the one being changed).
create or replace function room_is_free(p_room_id text, p_from timestamptz, p_to timestamptz, p_except uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from reservations r
    where r.room_id = p_room_id
      and r.status in ('upcoming', 'checked_in')
      and r.id is distinct from p_except
      and r.check_in < p_to
      and r.check_out > p_from
  );
$$;
revoke all on function room_is_free(text, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- One booking as the calendar and list show it.
create or replace function booking_json(p_reservation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id, 'ref', r.booking_ref, 'status', r.status, 'source', r.source,
    'roomId', r.room_id, 'roomNumber', rm.number, 'roomType', rm.type,
    'guest', jsonb_build_object('id', g.id, 'name', g.name, 'phone', g.phone, 'email', g.email, 'vip', g.vip),
    'checkIn', r.check_in, 'checkOut', r.check_out,
    -- A guest who has left is shown leaving the day they actually left (early or late).
    'checkInDate', ist_date(r.check_in), 'checkOutDate', d.out_date,
    'nights', d.out_date - ist_date(r.check_in),
    'partySize', r.party_size, 'ratePerNight', r.rate_per_night,
    'channel', r.channel, 'channelDetail', r.channel_detail, 'notes', r.notes,
    'createdAt', r.created_at, 'checkedOutAt', r.checked_out_at,
    'cancelledAt', r.cancelled_at, 'cancelReason', r.cancel_reason,
    'totals', folio_totals(r.id),
    'invoiceNumber', (select number from invoices i where i.reservation_id = r.id)
  )
  from reservations r
  left join rooms rm on rm.id = r.room_id
  left join guests g on g.id = r.guest_id
  cross join lateral (
    select greatest(
      ist_date(case when r.status = 'checked_out' then coalesce(r.checked_out_at, r.check_out) else r.check_out end),
      ist_date(r.check_in) + 1
    ) as out_date
  ) d
  where r.id = p_reservation_id;
$$;
revoke all on function booking_json(uuid) from public, anon, authenticated;

-- The calendar's window (bookings overlapping p_from..p_to, departures on
-- p_from included), or, with a query, a search across all dates.
create or replace function staff_list_bookings(p_property_id text, p_from date, p_to date, p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_q is null and (p_to - p_from) > 120 then
    raise exception 'Pick a shorter range';
  end if;

  return (
    select coalesce(jsonb_agg(booking_json(x.id) order by x.check_in), '[]'::jsonb)
    from (
      select r.id, r.check_in
      from reservations r
      left join guests g on g.id = r.guest_id
      left join rooms rm on rm.id = r.room_id
      where r.property_id = p_property_id
        and (
          (v_q is null and ist_date(r.check_in) <= p_to and ist_date(r.check_out) >= p_from)
          or (v_q is not null and (
                g.name ilike '%' || v_q || '%' or g.phone ilike '%' || v_q || '%' or g.email ilike '%' || v_q || '%'
                or r.booking_ref ilike v_q || '%' or rm.number = v_q
             ))
        )
      order by r.check_in desc
      limit case when v_q is null then 1000 else 100 end
    ) x
  );
end;
$$;
revoke all on function staff_list_bookings(text, date, date, text) from public, anon;
grant execute on function staff_list_bookings(text, date, date, text) to authenticated;

-- Change a booking. Only keys present in p_changes are changed:
-- checkInDate, checkOutDate (YYYY-MM-DD), roomId, ratePerNight, partySize,
-- notes, channel, channelDetail, guestName, guestPhone, guestEmail, vip.
create or replace function staff_update_booking(p_reservation_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_old_room rooms%rowtype;
  v_room rooms%rowtype;
  v_in date;
  v_out date;
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_room_id text;
  v_party integer;
  v_vip boolean;
  v_task_id uuid;
begin
  select * into v_res from reservations where id = p_reservation_id for update;
  if v_res.id is null or not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_res.status not in ('upcoming', 'checked_in') then
    raise exception 'This booking is closed and can''t be changed';
  end if;

  v_in := coalesce((p_changes->>'checkInDate')::date, ist_date(v_res.check_in));
  v_out := coalesce((p_changes->>'checkOutDate')::date, ist_date(v_res.check_out));
  v_room_id := coalesce(nullif(p_changes->>'roomId', ''), v_res.room_id);

  if v_out <= v_in then
    raise exception 'Departure must be after arrival';
  end if;
  if v_res.status = 'checked_in' then
    if v_in <> ist_date(v_res.check_in) then
      raise exception 'The guest has already arrived; only the departure date can change';
    end if;
    if v_out < ist_today() then
      raise exception 'Departure can''t be in the past';
    end if;
    v_check_in := v_res.check_in;
  else
    if v_in < ist_today() and v_in <> ist_date(v_res.check_in) then
      raise exception 'Arrival can''t be moved into the past';
    end if;
    v_check_in := case when v_in = ist_date(v_res.check_in) then v_res.check_in else stay_start(v_in) end;
  end if;
  v_check_out := case when v_out = ist_date(v_res.check_out) then v_res.check_out else stay_end(v_out) end;

  select * into v_room from rooms where id = v_room_id and property_id = v_res.property_id;
  if v_room.id is null then
    raise exception 'Room not found on this property';
  end if;
  if (v_room_id is distinct from v_res.room_id or v_check_in <> v_res.check_in or v_check_out <> v_res.check_out) then
    if v_room.status = 'maintenance' then
      raise exception 'Room % is under maintenance', v_room.number;
    end if;
    if not room_is_free(v_room_id, v_check_in, v_check_out, v_res.id) then
      raise exception 'Room % is booked for some of those nights', v_room.number;
    end if;
  end if;

  v_party := coalesce((p_changes->>'partySize')::int, v_res.party_size);
  if v_party < 1 then
    raise exception 'At least one guest';
  end if;
  if coalesce(v_room.max_occupancy, 0) > 0 and v_party > v_room.max_occupancy then
    raise exception 'Room % sleeps %', v_room.number, v_room.max_occupancy;
  end if;
  if p_changes ? 'ratePerNight' and (p_changes->>'ratePerNight')::numeric < 0 then
    raise exception 'The rate can''t be negative';
  end if;
  if p_changes ? 'channel' and (p_changes->>'channel') not in ('walk_in', 'phone', 'email', 'website', 'ota', 'agent', 'other') then
    raise exception 'Unknown channel';
  end if;
  if p_changes ? 'guestName' and length(trim(coalesce(p_changes->>'guestName', ''))) = 0 then
    raise exception 'Guest name is required';
  end if;

  -- Moving an in-house guest: the new room must be ready; the old one needs cleaning.
  if v_res.status = 'checked_in' and v_room_id is distinct from v_res.room_id then
    if v_room.status not in ('ready') then
      raise exception 'Room % isn''t ready (status: %)', v_room.number, v_room.status;
    end if;
    select * into v_old_room from rooms where id = v_res.room_id;
    select coalesce(vip, false) into v_vip from guests where id = v_res.guest_id;
    update rooms set status = case when v_vip then 'occupied_vip' else 'occupied' end where id = v_room_id;
    if v_old_room.id is not null then
      update rooms set status = 'dirty' where id = v_old_room.id;
      insert into tasks (property_id, room_number, room_label, title, priority, status, category)
      values (v_res.property_id, v_old_room.number, 'Room ' || v_old_room.number, 'Clean Room ' || v_old_room.number || ' (guest moved)', 'standard', 'pending', 'housekeeping')
      returning id into v_task_id;
    end if;
  end if;

  update reservations set
    room_id = v_room_id,
    check_in = v_check_in,
    check_out = v_check_out,
    party_size = v_party,
    rate_per_night = case when p_changes ? 'ratePerNight' then round((p_changes->>'ratePerNight')::numeric, 2) else rate_per_night end,
    notes = case when p_changes ? 'notes' then nullif(trim(p_changes->>'notes'), '') else notes end,
    channel = coalesce(p_changes->>'channel', channel),
    channel_detail = case when p_changes ? 'channelDetail' then nullif(trim(p_changes->>'channelDetail'), '') else channel_detail end
  where id = v_res.id;

  update guests set
    name = case when p_changes ? 'guestName' then trim(p_changes->>'guestName') else name end,
    phone = case when p_changes ? 'guestPhone' then nullif(trim(p_changes->>'guestPhone'), '') else phone end,
    email = case when p_changes ? 'guestEmail' then nullif(trim(p_changes->>'guestEmail'), '') else email end,
    vip = coalesce((p_changes->>'vip')::boolean, vip)
  where id = v_res.guest_id;

  return booking_json(v_res.id);
end;
$$;
revoke all on function staff_update_booking(uuid, jsonb) from public, anon;
grant execute on function staff_update_booking(uuid, jsonb) to authenticated;

-- Cancel a booking that hasn't arrived, optionally with a fee. Money already
-- taken stays on the bill: the result's balance below zero is a refund due.
drop function if exists staff_cancel_reservation(uuid);
create or replace function staff_cancel_reservation(p_reservation_id uuid, p_reason text default null, p_fee numeric default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
begin
  select * into v_res from reservations where id = p_reservation_id for update;
  if v_res.id is null or not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_res.status <> 'upcoming' then
    raise exception 'Only a booking that hasn''t arrived can be cancelled';
  end if;
  if coalesce(p_fee, 0) < 0 then
    raise exception 'The fee can''t be negative';
  end if;
  if coalesce(p_fee, 0) > 0 then
    insert into folio_charges (property_id, reservation_id, description, amount, category)
    values (v_res.property_id, v_res.id, 'Cancellation fee', round(p_fee, 2), 'extra');
  end if;
  update reservations
  set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(trim(p_reason), '')
  where id = v_res.id;
  return booking_json(v_res.id);
end;
$$;
revoke all on function staff_cancel_reservation(uuid, text, numeric) from public, anon;
grant execute on function staff_cancel_reservation(uuid, text, numeric) to authenticated;

-- The guest never came. From the arrival day on; optionally charged.
create or replace function staff_mark_no_show(p_reservation_id uuid, p_fee numeric default 0, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
begin
  select * into v_res from reservations where id = p_reservation_id for update;
  if v_res.id is null or not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_res.status <> 'upcoming' then
    raise exception 'Only a booking that hasn''t arrived can be a no-show';
  end if;
  if ist_date(v_res.check_in) > ist_today() then
    raise exception 'It''s not the arrival day yet';
  end if;
  if coalesce(p_fee, 0) < 0 then
    raise exception 'The charge can''t be negative';
  end if;
  if coalesce(p_fee, 0) > 0 then
    insert into folio_charges (property_id, reservation_id, description, amount, category)
    values (v_res.property_id, v_res.id, 'No-show charge', round(p_fee, 2), 'extra');
  end if;
  update reservations
  set status = 'no_show', cancelled_at = now(), cancel_reason = nullif(trim(p_reason), '')
  where id = v_res.id;
  return booking_json(v_res.id);
end;
$$;
revoke all on function staff_mark_no_show(uuid, numeric, text) from public, anon;
grant execute on function staff_mark_no_show(uuid, numeric, text) to authenticated;

-- A cancelled or no-show booking that took money gets its bill once settled.
create or replace function staff_issue_bill(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_totals jsonb;
  v_invoice invoices%rowtype;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if v_res.id is null or not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_res.status not in ('cancelled', 'no_show') then
    raise exception 'Bills for stays are issued at check-out';
  end if;
  v_totals := folio_totals(v_res.id);
  if (v_totals->>'total')::numeric <= 0 and (v_totals->>'paid')::numeric <= 0 then
    raise exception 'Nothing was charged or paid, so there''s no bill';
  end if;
  if abs((v_totals->>'balance')::numeric) > 0.005 then
    raise exception 'Settle the balance first (%)', (v_totals->>'balance');
  end if;
  v_invoice := issue_invoice(v_res.id);
  return jsonb_build_object('invoiceNumber', v_invoice.number, 'shareToken', v_invoice.share_token);
end;
$$;
revoke all on function staff_issue_bill(uuid) from public, anon;
grant execute on function staff_issue_bill(uuid) to authenticated;

-- Check in an expected guest. Arriving before the booked day moves the
-- arrival to now (room nights then start tonight), as long as the room is
-- free for the extra nights.
create or replace function staff_check_in_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_room rooms%rowtype;
  v_vip boolean;
  v_check_in timestamptz;
begin
  select * into v_res from reservations where id = p_reservation_id for update;
  if v_res.id is null or not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_res.status <> 'upcoming' then
    raise exception 'Only an expected guest can be checked in';
  end if;
  select * into v_room from rooms where id = v_res.room_id;
  if v_room.status = 'maintenance' then
    raise exception 'Room % is under maintenance', v_room.number;
  end if;
  if exists (select 1 from reservations o where o.room_id = v_res.room_id and o.status = 'checked_in' and o.id <> v_res.id) then
    raise exception 'Room % still has a guest checked in', v_room.number;
  end if;

  v_check_in := v_res.check_in;
  if ist_date(v_res.check_in) > ist_today() then
    if not room_is_free(v_res.room_id, now(), v_res.check_out, v_res.id) then
      raise exception 'Room % is booked before this guest''s arrival date', v_room.number;
    end if;
    v_check_in := now();
  end if;

  update reservations set status = 'checked_in', check_in = v_check_in where id = p_reservation_id;
  select vip into v_vip from guests where id = v_res.guest_id;
  update rooms set status = case when coalesce(v_vip, false) then 'occupied_vip' else 'occupied' end where id = v_res.room_id;
end;
$$;
revoke all on function staff_check_in_reservation(uuid) from public, anon;
grant execute on function staff_check_in_reservation(uuid) to authenticated;

-- Payments are allowed on any open bill now, including a cancellation fee
-- or a no-show charge (0079 refused payments on cancelled bookings).
create or replace function staff_record_folio_payment(
  p_reservation_id uuid, p_amount numeric, p_description text, p_method text,
  p_reference text default null, p_kind text default 'payment'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_id uuid;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if v_res.id is null then
    raise exception 'Reservation not found';
  end if;
  if not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount above zero';
  end if;
  if p_method not in ('cash', 'card', 'upi', 'bank', 'other') then
    raise exception 'Invalid payment method: %', p_method;
  end if;
  if coalesce(p_kind, 'payment') not in ('payment', 'refund') then
    raise exception 'Invalid kind';
  end if;
  if exists (select 1 from invoices where reservation_id = v_res.id) then
    raise exception 'The bill for this booking is already issued';
  end if;

  insert into folio_payments (property_id, reservation_id, kind, amount, method, reference, note)
  values (v_res.property_id, v_res.id, coalesce(p_kind, 'payment'), round(p_amount, 2), p_method,
          nullif(trim(p_reference), ''),
          coalesce(nullif(trim(p_description), ''), case when p_kind = 'refund' then 'Refund' else 'Payment received' end))
  returning id into v_id;
  return v_id;
end;
$$;

-- New bookings record where they came from and any notes.
drop function if exists staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, integer, timestamptz, text, numeric);
create or replace function staff_checkin_new_guest(
  p_property_id text, p_room_id text, p_guest_name text,
  p_guest_phone text default null, p_guest_email text default null, p_guest_vip boolean default false,
  p_id_document_url text default null, p_check_out timestamptz default null, p_party_size integer default 1,
  p_check_in timestamptz default now(), p_source text default 'built_in', p_rate_per_night numeric default null,
  p_channel text default 'walk_in', p_channel_detail text default null, p_notes text default null
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
  v_channel text := case when p_channel in ('walk_in', 'phone', 'email', 'website', 'ota', 'agent', 'other') then p_channel else 'walk_in' end;
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
  if p_rate_per_night is not null and p_rate_per_night < 0 then
    raise exception 'The rate can''t be negative';
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
  if not room_is_free(p_room_id, v_check_in, v_check_out, null) then
    raise exception 'Room % already has a booking overlapping that date range', v_room.number;
  end if;

  insert into guests (name, email, phone, vip, id_document_url)
  values (trim(p_guest_name), nullif(trim(p_guest_email), ''), nullif(trim(p_guest_phone), ''), coalesce(p_guest_vip, false), nullif(trim(p_id_document_url), ''))
  returning id into v_guest_id;

  insert into reservations (property_id, room_id, guest_id, check_in, check_out, party_size, status, source, rate_per_night, channel, channel_detail, notes)
  values (
    p_property_id, p_room_id, v_guest_id, v_check_in, v_check_out,
    greatest(coalesce(p_party_size, 1), 1),
    case when v_is_immediate then 'checked_in' else 'upcoming' end,
    v_source,
    coalesce(p_rate_per_night, v_room.price_per_night),
    v_channel,
    nullif(trim(p_channel_detail), ''),
    nullif(trim(p_notes), '')
  )
  returning id into v_reservation_id;

  if v_is_immediate then
    update rooms set status = case when coalesce(p_guest_vip, false) then 'occupied_vip' else 'occupied' end
      where id = p_room_id;
  end if;

  return v_reservation_id;
end;
$$;
revoke all on function staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, integer, timestamptz, text, numeric, text, text, text) from public, anon;
grant execute on function staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, integer, timestamptz, text, numeric, text, text, text) to authenticated;
