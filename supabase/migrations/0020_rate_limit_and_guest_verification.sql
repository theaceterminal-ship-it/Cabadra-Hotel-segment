-- Two separate security layers:
--
-- 1. Logical rate limiting on guest_resolve_room_token — the one anon RPC
--    with a genuinely guessable input space (room ids like
--    'grand-horizon-102' are sequential, unlike a reservation's random
--    guest_token). A real API gateway would rate-limit by caller IP; a
--    plain Postgres function has no reliable access to that, so this
--    limits by the thing actually being probed — the room id itself. A
--    script hammering one room to see if it's occupied yet gets cut off;
--    it doesn't stop someone trying many different room ids once each,
--    but that's a much slower, much noisier attack than the one this
--    closes off.
--
-- 2. Guest verification scaffold — infrastructure only, per the ask to
--    have this ready to switch on later without a schema migration at
--    that point. Nothing below changes current behavior: guest_resolve_room_token
--    still returns a token exactly as it does today. When you're ready to
--    require OTP entry before a scanned QR actually opens the guest app,
--    the one line to add is noted at the bottom.
--
-- Apply after 0001-0019.

-- ============================================================================
-- 1. RATE LIMITING
-- ============================================================================

create table rate_limit_hits (
  bucket_key text not null,
  hit_at timestamptz not null default now()
);

create index idx_rate_limit_hits_bucket on rate_limit_hits(bucket_key, hit_at);

-- Old rows are cheap to accumulate and cheap to sweep — no need for a
-- separate cron job, each check opportunistically clears its own bucket's
-- stale hits before counting.
create or replace function check_rate_limit(p_bucket_key text, p_max_calls int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from rate_limit_hits where bucket_key = p_bucket_key and hit_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count from rate_limit_hits where bucket_key = p_bucket_key;
  if v_count >= p_max_calls then
    return false;
  end if;

  insert into rate_limit_hits (bucket_key) values (p_bucket_key);
  return true;
end;
$$;

revoke all on function check_rate_limit(text, int, int) from public, anon, authenticated;

create or replace function guest_resolve_room_token(p_room_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if not check_rate_limit('resolve_room:' || p_room_id, 20, 60) then
    raise exception 'Too many attempts for this room — wait a minute and try again';
  end if;

  select r.guest_token into v_token
  from reservations r
  where r.room_id = p_room_id and r.status = 'checked_in'
  order by r.created_at desc
  limit 1;

  if v_token is null then
    raise exception 'No guest is currently checked into this room';
  end if;

  return v_token;
end;
$$;

grant execute on function guest_resolve_room_token(text) to anon;

-- ============================================================================
-- 2. GUEST VERIFICATION SCAFFOLD (inert until wired in)
-- ============================================================================

-- Set once a guest has entered a correct OTP for their stay. Nothing reads
-- this column yet — see the note at the bottom for the one-line change
-- that starts enforcing it.
alter table reservations add column if not exists guest_verified_at timestamptz;

-- Placeholder for "send an OTP to this guest's phone" — deliberately not
-- wired to any SMS provider yet. When you add one (Twilio, MSG91, etc.),
-- this is a normal candidate for an Edge Function (it needs a provider API
-- key, which — same rule as everywhere else in this app — must not live
-- in client code): generate a code, store its hash + expiry somewhere
-- (a small otp_challenges table, not written yet), call the SMS provider,
-- and have staff_verify_guest_otp check it before setting guest_verified_at.
create or replace function staff_send_guest_otp(p_reservation_id uuid)
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

  raise notice 'staff_send_guest_otp is a placeholder — wire an SMS provider in before relying on this.';
end;
$$;

grant execute on function staff_send_guest_otp(uuid) to authenticated;

-- Placeholder verification — always succeeds today (marks verified without
-- actually checking a code), so the guest app's behavior is unchanged
-- until this is wired to a real OTP check.
create or replace function guest_verify_otp(p_token uuid, p_otp text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  update reservations set guest_verified_at = now() where id = v_reservation.id;
  return true;
end;
$$;

grant execute on function guest_verify_otp(uuid, text) to anon;

-- TO ACTUALLY ENFORCE OTP LATER: add
--   if v_token is not null and not exists (select 1 from reservations where guest_token = v_token and guest_verified_at is not null) then
--     raise exception 'Guest not yet verified';
--   end if;
-- to guest_resolve_room_token, right after the token is found. Until that
-- line is added, everything above is inert infrastructure only.
