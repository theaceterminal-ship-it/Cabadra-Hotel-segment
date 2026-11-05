-- 0094: a public booking link for each hotel (hotel.churmuri.com/book/<slug>).
--
-- Off by default. An owner turns it on from the property's Overview, which gives the
-- property its slug. Only properties where Cabadra is the front desk can use it (a hotel
-- that keeps bookings in its own PMS has no business taking them here).
--
-- Three functions a guest who is not signed in can call:
--   public_booking_property  the hotel's name, photo, times and tax rates
--   public_booking_search    which room types are free for a stay, from what rooms exist today
--   public_booking_create    makes an 'upcoming' booking (channel 'website', pay at the hotel)
--
-- Nothing else is opened: no table is readable by anon, and these functions return only
-- what the booking page shows (no room numbers, no guest data). The booking goes through
-- the same trigger as any advance booking, so the guest's confirmation email (0092) and the
-- reception calendar work unchanged, and the hotel gets a bell notification.
--
-- Abuse limits: per caller (IP) for searching and booking, per phone number per day, and per
-- hotel per hour. A repeated submit of the same booking returns the first one.
--
-- Apply after 0001-0093. Safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. The slug and the switch
-- ---------------------------------------------------------------------------
alter table properties
  add column if not exists booking_slug text,
  add column if not exists booking_enabled boolean not null default false;

create unique index if not exists properties_booking_slug_key on properties (lower(booking_slug)) where booking_slug is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_booking_slug_format') then
    alter table properties add constraint properties_booking_slug_format
      check (booking_slug is null or booking_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(booking_slug) between 3 and 60);
  end if;
end $$;

-- Owner: turn the link on or off. Makes the slug the first time, from the hotel's name.
create or replace function owner_set_booking_link(p_property_id text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop properties%rowtype;
  v_base text;
  v_slug text;
  v_n int := 1;
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only the property owner can change the booking link';
  end if;
  select * into v_prop from properties where id = p_property_id for update;
  if not found then
    raise exception 'Property not found';
  end if;
  if p_enabled and v_prop.has_external_pms then
    raise exception 'The booking link needs Cabadra to be your front desk. Turn off "We use another PMS" first';
  end if;

  v_slug := v_prop.booking_slug;
  if v_slug is null and p_enabled then
    v_base := trim(both '-' from regexp_replace(lower(v_prop.name), '[^a-z0-9]+', '-', 'g'));
    v_base := left(coalesce(nullif(v_base, ''), 'hotel'), 50);
    if length(v_base) < 3 then v_base := v_base || '-stay'; end if;
    v_slug := v_base;
    while exists (select 1 from properties where lower(booking_slug) = v_slug) loop
      v_n := v_n + 1;
      v_slug := left(v_base, 50) || '-' || v_n;
    end loop;
  end if;

  update properties set booking_slug = v_slug, booking_enabled = p_enabled where id = p_property_id;
  return jsonb_build_object('slug', v_slug, 'enabled', p_enabled);
end;
$$;
revoke all on function owner_set_booking_link(text, boolean) from public, anon;
grant execute on function owner_set_booking_link(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers (not callable from outside)
-- ---------------------------------------------------------------------------
-- Who is calling: Cloudflare's header, else the first x-forwarded-for entry. NULL in the SQL editor.
create or replace function public_booking_caller_ip()
returns text
language plpgsql
stable
as $$
declare
  v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  return coalesce(
    nullif(trim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '')
  );
end;
$$;
revoke all on function public_booking_caller_ip() from public, anon, authenticated;

-- The hotel behind a slug, only when its link is on and Cabadra is its front desk.
create or replace function public_booking_resolve(p_slug text)
returns properties
language sql
stable
security definer
set search_path = public
as $$
  select * from properties
  where lower(booking_slug) = lower(coalesce(p_slug, ''))
    and booking_enabled
    and not has_external_pms
    and status = 'active'
  limit 1;
$$;
revoke all on function public_booking_resolve(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The hotel's page header
-- ---------------------------------------------------------------------------
create or replace function public_booking_property(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop properties%rowtype;
  v_ip text := public_booking_caller_ip();
begin
  if v_ip is not null and not check_rate_limit('pb_view:' || v_ip, 120, 60) then
    raise exception 'Too many requests. Wait a minute and try again';
  end if;
  v_prop := public_booking_resolve(p_slug);
  if v_prop.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'name', v_prop.name,
    'location', v_prop.location,
    'image', v_prop.image,
    'currency', v_prop.currency,
    'checkInTime', v_prop.check_in_time,
    'checkOutTime', v_prop.check_out_time,
    'phone', v_prop.billing_phone,
    'mapsUrl', v_prop.maps_url,
    'gst', case when v_prop.gst_enabled then jsonb_build_object(
      'lowRate', v_prop.gst_room_low_rate, 'highRate', v_prop.gst_room_high_rate, 'threshold', v_prop.gst_room_threshold
    ) end
  );
end;
$$;
revoke all on function public_booking_property(text) from public;
grant execute on function public_booking_property(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Which room types are free
-- ---------------------------------------------------------------------------
-- One row per room type: the lowest price among its free rooms that fit the party. No room
-- numbers leave the database.
create or replace function public_booking_search(p_slug text, p_check_in date, p_check_out date, p_guests integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop properties%rowtype;
  v_ip text := public_booking_caller_ip();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_from timestamptz;
  v_to timestamptz;
begin
  if v_ip is not null and not check_rate_limit('pb_search:' || v_ip, 40, 60) then
    raise exception 'Too many searches. Wait a minute and try again';
  end if;
  v_prop := public_booking_resolve(p_slug);
  if v_prop.id is null then
    raise exception 'This booking link is not available';
  end if;
  if p_check_in is null or p_check_out is null or p_check_in < v_today then
    raise exception 'Pick a check-in date from today onwards';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
  end if;
  if p_check_out - p_check_in > 30 or p_check_in > v_today + 365 then
    raise exception 'Choose a stay of up to 30 nights, within the next year';
  end if;
  v_from := stay_start(p_check_in);
  v_to := stay_end(p_check_out);

  return coalesce((
    select jsonb_agg(t order by (t ->> 'price')::numeric)
    from (
      select jsonb_build_object(
        'type', r.type,
        'price', min(r.price_per_night),
        'sleeps', min(r.max_occupancy),
        'beds', (array_agg(r.beds_description order by r.price_per_night) filter (where r.beds_description is not null))[1],
        'image', (array_agg(r.image order by r.price_per_night) filter (where r.image is not null))[1],
        'left', count(*)
      ) as t
      from rooms r
      where r.property_id = v_prop.id
        and r.status <> 'maintenance'
        and r.max_occupancy >= greatest(coalesce(p_guests, 1), 1)
        and r.price_per_night > 0
        and room_is_free(r.id, v_from, v_to, null)
      group by r.type
    ) s
  ), '[]'::jsonb);
end;
$$;
revoke all on function public_booking_search(text, date, date, integer) from public;
grant execute on function public_booking_search(text, date, date, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The booking
-- ---------------------------------------------------------------------------
create or replace function public_booking_create(
  p_slug text, p_room_type text, p_check_in date, p_check_out date, p_guests integer,
  p_name text, p_phone text, p_email text default null, p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop properties%rowtype;
  v_ip text := public_booking_caller_ip();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_from timestamptz;
  v_to timestamptz;
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_room rooms%rowtype;
  v_guest_id uuid;
  v_res_id uuid;
  v_ref text;
  v_existing record;
begin
  if v_ip is not null and not check_rate_limit('pb_create_ip:' || v_ip, 5, 600) then
    raise exception 'Too many bookings from this device. Wait a few minutes or call the hotel';
  end if;
  v_prop := public_booking_resolve(p_slug);
  if v_prop.id is null then
    raise exception 'This booking link is not available';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Enter your name';
  end if;
  if length(v_digits) < 10 or length(v_digits) > 15 then
    raise exception 'Enter a phone number with at least 10 digits';
  end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'That email address doesn''t look right';
  end if;
  if p_guests is null or p_guests < 1 or p_guests > 12 then
    raise exception 'Choose between 1 and 12 guests';
  end if;
  if p_check_in is null or p_check_out is null or p_check_in < v_today then
    raise exception 'Pick a check-in date from today onwards';
  end if;
  if p_check_out <= p_check_in or p_check_out - p_check_in > 30 or p_check_in > v_today + 365 then
    raise exception 'Choose a stay of up to 30 nights, within the next year';
  end if;
  if p_room_type is null or length(trim(p_room_type)) = 0 then
    raise exception 'Choose a room';
  end if;
  v_from := stay_start(p_check_in);
  v_to := stay_end(p_check_out);

  if not check_rate_limit('pb_create_phone:' || v_digits, 3, 86400) then
    raise exception 'This phone number has already made several bookings today. Please call the hotel';
  end if;
  if not check_rate_limit('pb_create_hotel:' || v_prop.id, 60, 3600) then
    raise exception 'The hotel is getting many requests right now. Please call to book';
  end if;

  -- One booking at a time per hotel, so two guests can't both get the last room.
  perform pg_advisory_xact_lock(hashtext('pb:' || v_prop.id));

  -- The same guest pressing the button twice: give back the first booking.
  select r.booking_ref, rm.type into v_existing
  from reservations r
  join guests g on g.id = r.guest_id
  join rooms rm on rm.id = r.room_id
  where r.property_id = v_prop.id and r.channel = 'website' and r.status = 'upcoming'
    and r.check_in = v_from and r.check_out = v_to
    and regexp_replace(coalesce(g.phone, ''), '[^0-9]', '', 'g') = v_digits
    and r.created_at > now() - interval '15 minutes'
  limit 1;
  if found then
    return jsonb_build_object('ref', v_existing.booking_ref, 'roomType', v_existing.type, 'hotel', v_prop.name);
  end if;

  select * into v_room
  from rooms r
  where r.property_id = v_prop.id
    and r.type = trim(p_room_type)
    and r.status <> 'maintenance'
    and r.max_occupancy >= p_guests
    and r.price_per_night > 0
    and room_is_free(r.id, v_from, v_to, null)
  order by r.price_per_night, r.number
  limit 1;
  if not found then
    raise exception 'Sorry, that room type was just taken for these dates. Please choose another';
  end if;

  insert into guests (name, email, phone, vip)
  values (v_name, v_email, v_phone, false)
  returning id into v_guest_id;

  insert into reservations (property_id, room_id, guest_id, check_in, check_out, party_size, status, source, rate_per_night, channel, channel_detail, notes)
  values (v_prop.id, v_room.id, v_guest_id, v_from, v_to, p_guests, 'upcoming', 'built_in', v_room.price_per_night, 'website', 'Booking link', left(nullif(trim(p_notes), ''), 500))
  returning id, booking_ref into v_res_id, v_ref;

  insert into notifications (property_id, type, title, body, room_number, ref_id)
  values (v_prop.id, 'new_arrival', 'New website booking: ' || v_name,
          v_room.type || ' · ' || to_char(p_check_in, 'DD Mon') || ' to ' || to_char(p_check_out, 'DD Mon') || ' · ' || p_guests || ' guest(s) · #' || v_ref,
          v_room.number, v_res_id);

  return jsonb_build_object('ref', v_ref, 'roomType', v_room.type, 'hotel', v_prop.name);
end;
$$;
revoke all on function public_booking_create(text, text, date, date, integer, text, text, text, text) from public;
grant execute on function public_booking_create(text, text, date, date, integer, text, text, text, text) to anon, authenticated;
