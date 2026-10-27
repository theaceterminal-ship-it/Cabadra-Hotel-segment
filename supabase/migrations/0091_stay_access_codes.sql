-- 0091: who may open a room's guest app from the room QR.
--
-- The printed room QR is permanent and, until now, opened whichever stay was
-- checked in at that moment. So someone who had stayed before (or who had just
-- photographed the sticker) could scan it later and land in the NEXT guest's
-- chat, orders and bill. The sticker can't change per guest, so what changes is
-- what scanning it asks for:
--
--   access_mode  'open'   the old behaviour. Only for stays that were already
--                         checked in when this ran; it ends at their checkout.
--                'link'   the QR opens nothing by itself. The guest uses the
--                         personal stay link from reception (once; the phone
--                         remembers it, and after that the QR works on that
--                         phone too). This is the default for every new stay.
--                'email'  the QR asks for a 6-digit code that was emailed to
--                         the guest's own address at check-in. Entered once per
--                         phone; good until checkout.
--                'sms'    the same, by text message. Built but not switched on:
--                         nothing sets this until the Twilio sender is deployed.
--
-- The code is made on the server and sent by an Edge Function straight to the
-- guest. It is never returned to a browser, so reception can't read it. It is
-- stored hashed, wrong guesses are counted without raising (a raised error would
-- roll the count back), five wrong guesses lock the stay for 30 minutes, and after
-- three locks the code is thrown away and a new one must be sent. Every lock is
-- written to security_events (0089).
--
-- Apply after 0001-0090.

alter table reservations
  add column if not exists access_mode text not null default 'open'
  check (access_mode in ('open', 'link', 'email', 'sms'));
-- Everything that exists today keeps working exactly as before ('open' from the
-- column default). From now on a new stay starts closed:
alter table reservations alter column access_mode set default 'link';
-- Stays that haven't started yet get the new default (they pick a method at check-in).
update reservations set access_mode = 'link' where status in ('upcoming');

create table if not exists stay_access_codes (
  reservation_id uuid primary key references reservations(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  -- g•••@gmail.com / +91•••••••21: what the guest is shown, never the full value
  sent_to_masked text not null,
  -- null once the code has been thrown away (too many wrong guesses); a new one must be sent
  code_hash text,
  salt text not null,
  issued_at timestamptz not null default now(),
  last_sent_at timestamptz,
  send_error text,
  failed_attempts integer not null default 0,
  lock_cycles integer not null default 0,
  locked_until timestamptz,
  verified_count integer not null default 0,
  last_verified_at timestamptz
);
alter table stay_access_codes enable row level security;
revoke all on stay_access_codes from anon, authenticated;

-- A stay that ends takes its code with it.
create or replace function stay_access_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'checked_in' and old.status = 'checked_in' then
    delete from stay_access_codes where reservation_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function stay_access_cleanup() from public, anon, authenticated;
drop trigger if exists stay_access_cleanup on reservations;
create trigger stay_access_cleanup after update of status on reservations
  for each row execute function stay_access_cleanup();

create or replace function mask_email(p_email text)
returns text
language sql
immutable
as $$
  select left(split_part(p_email, '@', 1), 1) || '•••@' || split_part(p_email, '@', 2)
$$;

-- ---------------------------------------------------------------------------
-- Server side only: make a code. Called by the stay-access-code Edge Function
-- with the service role; returns the plain code so it can be mailed, and
-- stores only its hash.
-- ---------------------------------------------------------------------------
create or replace function system_issue_stay_code(p_reservation_id uuid, p_channel text default 'email')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_res reservations%rowtype;
  v_guest guests%rowtype;
  v_room rooms%rowtype;
  v_prop properties%rowtype;
  v_code text := lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
  v_salt text := encode(gen_random_bytes(8), 'hex');
  v_masked text;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if not found or v_res.status <> 'checked_in' then
    return jsonb_build_object('ok', false, 'reason', 'not_checked_in');
  end if;
  select * into v_guest from guests where id = v_res.guest_id;
  select * into v_room from rooms where id = v_res.room_id;
  select * into v_prop from properties where id = v_res.property_id;
  if p_channel = 'email' then
    if coalesce(trim(v_guest.email), '') = '' then
      return jsonb_build_object('ok', false, 'reason', 'no_email');
    end if;
    v_masked := mask_email(trim(v_guest.email));
  else
    return jsonb_build_object('ok', false, 'reason', 'channel_not_enabled');
  end if;

  insert into stay_access_codes (reservation_id, channel, sent_to_masked, code_hash, salt, issued_at, failed_attempts, lock_cycles, locked_until, send_error)
  values (p_reservation_id, p_channel, v_masked, encode(digest(v_salt || v_code || p_reservation_id::text, 'sha256'), 'hex'), v_salt, now(), 0, 0, null, null)
  on conflict (reservation_id) do update
    set channel = excluded.channel, sent_to_masked = excluded.sent_to_masked, code_hash = excluded.code_hash, salt = excluded.salt,
        issued_at = now(), failed_attempts = 0, lock_cycles = 0, locked_until = null, send_error = null;
  update reservations set access_mode = p_channel where id = p_reservation_id and access_mode <> p_channel;

  return jsonb_build_object(
    'ok', true, 'channel', p_channel, 'code', v_code, 'to', trim(v_guest.email), 'guest_name', v_guest.name,
    'property_name', v_prop.name, 'room_number', v_room.number, 'check_out', v_res.check_out
  );
end;
$$;
revoke all on function system_issue_stay_code(uuid, text) from public, anon, authenticated;
grant execute on function system_issue_stay_code(uuid, text) to service_role;

-- The Edge Function reports how the send went (so reception can see "not sent").
create or replace function system_stay_code_sent(p_reservation_id uuid, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update stay_access_codes
  set last_sent_at = case when p_error is null then now() else last_sent_at end,
      send_error = left(p_error, 200)
  where reservation_id = p_reservation_id
$$;
revoke all on function system_stay_code_sent(uuid, text) from public, anon, authenticated;
grant execute on function system_stay_code_sent(uuid, text) to service_role;

-- A guest asking for the code again from the room QR page. Always goes to the
-- address on file, so it can't be used to send mail to anyone else. 3 a stay per
-- hour, and 10 an hour per caller address.
create or replace function system_guest_resend_stay_code(p_room_code text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res reservations%rowtype;
  v_channel text;
begin
  if p_ip is not null and not check_rate_limit('stay_code_resend_ip:' || p_ip, 10, 3600) then
    return jsonb_build_object('ok', false, 'reason', 'slow_down');
  end if;
  select r.* into v_res
  from reservations r join rooms rm on rm.id = r.room_id
  where rm.qr_code = p_room_code and r.status = 'checked_in'
  order by r.created_at desc limit 1;
  if not found or v_res.access_mode not in ('email', 'sms') then
    return jsonb_build_object('ok', false, 'reason', 'none');
  end if;
  if not check_rate_limit('stay_code_resend:' || v_res.id, 3, 3600) then
    perform security_log('stay_code_resend_limit', v_res.property_id, 'reservations', v_res.id::text, '{}'::jsonb, 30);
    return jsonb_build_object('ok', false, 'reason', 'slow_down');
  end if;
  return system_issue_stay_code(v_res.id, v_res.access_mode);
end;
$$;
revoke all on function system_guest_resend_stay_code(text, text) from public, anon, authenticated;
grant execute on function system_guest_resend_stay_code(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Staff: see how a stay's access is set up; switch it to the stay link.
-- (Switching to email goes through the Edge Function, because that is what sends the code.)
-- ---------------------------------------------------------------------------
create or replace function staff_stay_access(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_guest guests%rowtype;
  v_room rooms%rowtype;
  v_code stay_access_codes%rowtype;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if not found or not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  select * into v_guest from guests where id = v_res.guest_id;
  select * into v_room from rooms where id = v_res.room_id;
  select * into v_code from stay_access_codes where reservation_id = p_reservation_id;
  return jsonb_build_object(
    'reservation_id', v_res.id,
    'status', v_res.status,
    'guest_name', v_guest.name,
    'room_number', v_room.number,
    'guest_token', v_res.guest_token,
    'access_mode', v_res.access_mode,
    'has_email', coalesce(trim(v_guest.email), '') <> '',
    'email_hint', case when coalesce(trim(v_guest.email), '') <> '' then mask_email(trim(v_guest.email)) end,
    'has_phone', coalesce(trim(v_guest.phone), '') <> '',
    'code_sent_to', v_code.sent_to_masked,
    'code_channel', v_code.channel,
    'code_issued_at', v_code.issued_at,
    'code_last_sent_at', v_code.last_sent_at,
    'code_send_error', v_code.send_error,
    'code_verified_count', coalesce(v_code.verified_count, 0),
    'code_locked_until', case when v_code.locked_until > now() then v_code.locked_until end,
    'code_thrown_away', v_code.reservation_id is not null and v_code.code_hash is null
  );
end;
$$;
revoke all on function staff_stay_access(uuid) from public, anon;
grant execute on function staff_stay_access(uuid) to authenticated;

create or replace function staff_set_stay_access_link(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property text;
begin
  select property_id into v_property from reservations where id = p_reservation_id;
  if v_property is null or not is_staff_for_property(v_property) then
    raise exception 'Not authorized for this property';
  end if;
  delete from stay_access_codes where reservation_id = p_reservation_id;
  update reservations set access_mode = 'link' where id = p_reservation_id and access_mode <> 'link';
end;
$$;
revoke all on function staff_set_stay_access_link(uuid) from public, anon;
grant execute on function staff_set_stay_access_link(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Guest: what scanning the room QR shows, and entering the code.
-- Neither raises for an ordinary miss, so the counts they keep are not rolled back.
-- ---------------------------------------------------------------------------
create or replace function guest_room_gate(p_room_code text, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers json;
  v_ip text;
  v_ip_bucket text;
  v_room rooms%rowtype;
  v_res reservations%rowtype;
  v_prop_name text;
  v_code stay_access_codes%rowtype;
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
      perform security_log('room_qr_guessing', null, 'rooms', null, jsonb_build_object('last_room_code', left(p_room_code, 64)), 10);
      return jsonb_build_object('status', 'slow_down');
    end if;
  end if;

  select * into v_room from rooms where qr_code = p_room_code;
  if found then
    if not check_rate_limit('resolve_room:' || v_room.id, 30, 60) then
      perform security_log('room_qr_rate_limited', v_room.property_id, 'rooms', v_room.id, '{}'::jsonb, 10);
      return jsonb_build_object('status', 'slow_down');
    end if;
    select * into v_res from reservations
    where room_id = v_room.id and status = 'checked_in'
    order by created_at desc limit 1;
  end if;

  if v_res.id is null then
    if v_ip_bucket is not null then
      insert into rate_limit_hits (bucket_key) values (v_ip_bucket);
    end if;
    return jsonb_build_object('status', 'none');
  end if;

  select name into v_prop_name from properties where id = v_res.property_id;

  -- A phone that already holds this stay's link (or has entered its code) goes straight in.
  if v_res.access_mode = 'open' or (p_token is not null and p_token = v_res.guest_token) then
    return jsonb_build_object('status', 'open', 'token', v_res.guest_token);
  end if;

  if v_res.access_mode in ('email', 'sms') then
    select * into v_code from stay_access_codes where reservation_id = v_res.id;
    return jsonb_build_object(
      'status', 'code_required',
      'channel', v_res.access_mode,
      'hint', v_code.sent_to_masked,
      'property_name', v_prop_name,
      'room_number', v_room.number,
      'locked', coalesce(v_code.locked_until > now(), false),
      'needs_new_code', v_code.reservation_id is null or v_code.code_hash is null
    );
  end if;

  return jsonb_build_object('status', 'link_required', 'property_name', v_prop_name, 'room_number', v_room.number);
end;
$$;
revoke all on function guest_room_gate(text, uuid) from public;
grant execute on function guest_room_gate(text, uuid) to anon, authenticated;

create or replace function guest_verify_stay_code(p_room_code text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_headers json;
  v_ip text;
  v_ip_bucket text;
  v_res reservations%rowtype;
  v_code stay_access_codes%rowtype;
  v_clean text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
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
  v_ip_bucket := case when v_ip is not null then 'stay_code_failures:' || v_ip end;
  if v_ip_bucket is not null then
    delete from rate_limit_hits where bucket_key = v_ip_bucket and hit_at < now() - interval '30 minutes';
    if (select count(*) from rate_limit_hits where bucket_key = v_ip_bucket) >= 15 then
      return jsonb_build_object('ok', false, 'reason', 'slow_down');
    end if;
  end if;

  select r.* into v_res
  from reservations r join rooms rm on rm.id = r.room_id
  where rm.qr_code = p_room_code and r.status = 'checked_in'
  order by r.created_at desc limit 1;
  if not found or v_res.access_mode not in ('email', 'sms') then
    if v_ip_bucket is not null then insert into rate_limit_hits (bucket_key) values (v_ip_bucket); end if;
    return jsonb_build_object('ok', false, 'reason', 'none');
  end if;

  select * into v_code from stay_access_codes where reservation_id = v_res.id for update;
  if not found or v_code.code_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'needs_new_code');
  end if;
  if v_code.locked_until is not null and v_code.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after_seconds', ceil(extract(epoch from v_code.locked_until - now()))::int);
  end if;

  if length(v_clean) = 6 and encode(digest(v_code.salt || v_clean || v_res.id::text, 'sha256'), 'hex') = v_code.code_hash then
    update stay_access_codes
    set failed_attempts = 0, lock_cycles = 0, locked_until = null, verified_count = verified_count + 1, last_verified_at = now()
    where reservation_id = v_res.id;
    return jsonb_build_object('ok', true, 'token', v_res.guest_token);
  end if;

  if v_ip_bucket is not null then insert into rate_limit_hits (bucket_key) values (v_ip_bucket); end if;
  update stay_access_codes set failed_attempts = failed_attempts + 1 where reservation_id = v_res.id returning * into v_code;
  if v_code.failed_attempts >= 5 then
    update stay_access_codes
    set failed_attempts = 0, lock_cycles = lock_cycles + 1, locked_until = now() + interval '30 minutes'
    where reservation_id = v_res.id returning * into v_code;
    perform security_log('stay_code_locked', v_res.property_id, 'reservations', v_res.id::text, jsonb_build_object('lock_cycles', v_code.lock_cycles), 5);
    if v_code.lock_cycles >= 3 then
      update stay_access_codes set code_hash = null where reservation_id = v_res.id;
      perform security_log('stay_code_thrown_away', v_res.property_id, 'reservations', v_res.id::text, '{}'::jsonb, 5);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after_seconds', 1800);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'wrong', 'attempts_left', 5 - v_code.failed_attempts);
end;
$$;
revoke all on function guest_verify_stay_code(text, text) from public;
grant execute on function guest_verify_stay_code(text, text) to anon, authenticated;

-- The old resolver (0011, 0072, 0074, 0090) handed the token to anyone holding the QR. It now
-- does that only for stays in 'open' mode; older app versions simply see "no one's here"
-- for the others instead of getting in. (0074's lookup by QR code, 0089's logging.)
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
      perform security_log('room_qr_guessing', null, 'rooms', null, jsonb_build_object('last_room_code', left(p_room_id, 64)), 10);
      raise exception 'Too many attempts — wait a few minutes and try again';
    end if;
  end if;

  -- p_room_id keeps its name for the existing client; it carries the QR code.
  select id into v_room_id from rooms where qr_code = lower(trim(coalesce(p_room_id, '')));

  if v_room_id is not null then
    if not check_rate_limit('resolve_room:' || v_room_id, 20, 60) then
      perform security_log('room_qr_rate_limited', (select property_id from rooms where id = v_room_id), 'rooms', v_room_id, '{}'::jsonb, 10);
      raise exception 'Too many attempts for this room — wait a minute and try again';
    end if;

    select r.guest_token into v_token
    from reservations r
    where r.room_id = v_room_id and r.status = 'checked_in' and r.access_mode = 'open'
    order by r.created_at desc
    limit 1;
  end if;

  if v_token is null and v_ip_bucket is not null then
    insert into rate_limit_hits (bucket_key) values (v_ip_bucket);
  end if;

  return v_token;
end;
$$;
