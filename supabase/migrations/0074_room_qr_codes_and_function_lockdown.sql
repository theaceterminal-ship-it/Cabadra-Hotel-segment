-- Security pass: random room QR codes, server-priced experience bookings,
-- and functions only callable by the people they're for.
--
-- 1. Room QR codes. A room's printed QR used to carry its id
--    ('<property-slug>-<room number>'), so anyone could guess any room's
--    link and open the checked-in guest's app (rate-limited since 0072,
--    but still guessable). Each room now gets a random 32-hex-character
--    code (~122 bits, from gen_random_uuid), kept only on the staff-only
--    rooms table and never returned by any guest function.
--    guest_resolve_room_token accepts only that code; old QRs printed
--    with the room id stop working and need reprinting from Reception.
--    Staff can issue a room a new code (Reception > room > QR) if a
--    sticker is ever copied.
--
-- 2. guest_book_experience. The old 3-argument version (0016) charged the
--    folio immediately with whatever price the browser sent, so a guest
--    could book for 0 or post a negative charge to cut their own bill.
--    It's dropped. The current version stored the browser's price too,
--    charged later on staff confirmation; it now looks the price and unit
--    up in this property's experiences and ignores the browser's.
--
-- 3. Who can call what. Supabase grants every new function to anon by
--    default and older migrations never took that back, so signed-out
--    visitors could call every staff_* function (each checks the caller,
--    so they got errors or nothing) and task_complete_core, which checks
--    nothing: it completes a task and charges its price to the room. It's
--    only meant to run inside the staff, task-QR and department-display
--    functions, so it's now internal. staff_* functions are now for
--    signed-in users only, and new functions are no longer granted to
--    anon by default: a guest-facing one needs an explicit grant.
-- Apply after 0001-0073.

-- 1. Room QR codes -----------------------------------------------------------

alter table rooms add column if not exists qr_code text;
update rooms set qr_code = replace(gen_random_uuid()::text, '-', '') where qr_code is null;
alter table rooms alter column qr_code set default replace(gen_random_uuid()::text, '-', '');
alter table rooms alter column qr_code set not null;
create unique index if not exists rooms_qr_code_key on rooms (qr_code);
alter table rooms drop constraint if exists rooms_qr_code_format;
alter table rooms add constraint rooms_qr_code_format check (qr_code ~ '^[0-9a-f]{32}$');

comment on column rooms.qr_code is
  'Random code in the room''s printed QR (/guest/room/<qr_code>). Staff-only; replace it to retire a copied sticker.';

-- Same as 0072 (per-caller and per-room limits, failures counted) except
-- that the room is found by its QR code, never by its id.
create or replace function guest_resolve_room_token(p_room_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers json;
  v_ip text;
  v_ip_bucket text;
  v_room_id text;
  v_token uuid;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := coalesce(
    nullif(trim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '')
  );
  v_ip_bucket := case when v_ip is not null then 'resolve_room_failures:' || v_ip end;

  if v_ip_bucket is not null then
    delete from rate_limit_hits where bucket_key = v_ip_bucket and hit_at < now() - interval '10 minutes';
    if (select count(*) from rate_limit_hits where bucket_key = v_ip_bucket) >= 20 then
      raise exception 'Too many attempts — wait a few minutes and try again';
    end if;
  end if;

  -- p_room_id keeps its name for the existing client; it carries the QR code.
  select id into v_room_id from rooms where qr_code = lower(trim(coalesce(p_room_id, '')));

  if v_room_id is not null then
    if not check_rate_limit('resolve_room:' || v_room_id, 20, 60) then
      raise exception 'Too many attempts for this room — wait a minute and try again';
    end if;

    select r.guest_token into v_token
    from reservations r
    where r.room_id = v_room_id and r.status = 'checked_in'
    order by r.created_at desc
    limit 1;
  end if;

  if v_token is null and v_ip_bucket is not null then
    insert into rate_limit_hits (bucket_key) values (v_ip_bucket);
  end if;

  return v_token;
end;
$$;

-- 2. Experience bookings priced by the server --------------------------------

drop function if exists guest_book_experience(uuid, text, numeric);

create or replace function guest_book_experience(
  p_token uuid, p_experience_name text, p_price numeric default 0, p_guest_count integer default 1,
  p_preferred_time text default null, p_notes text default null, p_unit_label text default 'per person'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_experience experiences%rowtype;
  v_booking experience_bookings%rowtype;
  v_room_number text;
  v_guests integer;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if v_reservation.id is null then
    raise exception 'Invalid guest link';
  end if;

  -- p_price and p_unit_label are ignored: the hotel's own listing decides both.
  select * into v_experience
  from experiences
  where property_id = v_reservation.property_id and lower(trim(name)) = lower(trim(coalesce(p_experience_name, '')))
  limit 1;
  if v_experience.id is null then
    raise exception 'This experience is no longer offered';
  end if;

  v_guests := least(greatest(coalesce(p_guest_count, 1), 1), 20);

  insert into experience_bookings (
    property_id, reservation_id, experience_name, price, guest_count, preferred_time, notes, unit_label, status
  )
  values (
    v_reservation.property_id, v_reservation.id, v_experience.name, v_experience.price * v_guests,
    v_guests, nullif(left(trim(p_preferred_time), 100), ''), nullif(left(trim(p_notes), 500), ''),
    coalesce(nullif(trim(v_experience.unit_label), ''), 'per person'), 'pending'
  )
  returning * into v_booking;

  select r.number into v_room_number from rooms r where r.id = v_reservation.room_id;

  insert into notifications (property_id, type, title, body, room_number, ref_id)
  values (
    v_reservation.property_id, 'guest_request',
    'Experience Reserved — Room ' || coalesce(v_room_number, '?'),
    v_experience.name || ' (' || v_guests || ' guests)',
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

revoke all on function guest_book_experience(uuid, text, numeric, integer, text, text, text) from public;
grant execute on function guest_book_experience(uuid, text, numeric, integer, text, text, text) to anon, authenticated;

-- 3. Who can call what --------------------------------------------------------

revoke all on function task_complete_core(uuid) from public, anon, authenticated;

-- Signed-in access is left exactly as it is (staff_create_property, for
-- one, is deliberately closed to everyone since 0067); only the anon and
-- PUBLIC grants go.
do $$
declare
  f record;
  v_authenticated boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname like 'staff\_%'
  loop
    v_authenticated := has_function_privilege('authenticated', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.sig);
    if v_authenticated then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- Functions created by migrations (owned by postgres) stop being granted
-- to anon automatically.
do $$
begin
  execute 'alter default privileges for role postgres in schema public revoke execute on functions from anon';
exception when insufficient_privilege then
  raise notice 'Could not change default privileges for postgres; new functions still need an explicit revoke from anon.';
end $$;
