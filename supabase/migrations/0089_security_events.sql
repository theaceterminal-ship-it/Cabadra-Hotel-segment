-- 0089: a record of who tried what and was refused.
--
-- 0087's audit_log records what CHANGED. This records what was REFUSED: someone
-- editing a posted bill line, a receptionist trying to change a room's price,
-- another hotel's staff poking at this hotel's stay, a guest link flooding the
-- chat, a script guessing room QR codes, anyone trying to edit the audit log.
--
-- A refused statement rolls back everything it did, including a log row written
-- in the same transaction, so the row is written on a separate short connection
-- back into this database (dblink) as a login that can only INSERT into this
-- one table. The connection string, with a random password generated here, is
-- kept in Vault, never in this file. If that loopback can't be made, the event
-- still goes to the Postgres log (RAISE WARNING) and, when the caller's
-- transaction survives, into the table.
--
-- What this CANNOT see: Row Level Security refusals (a staff member's request
-- that silently matches no rows, or "permission denied for table") never reach
-- any trigger or function. Those are in Supabase's API and Postgres logs
-- (Dashboard > Logs), not here.
--
-- Apply after 0001-0088.

create schema if not exists extensions;
do $$
begin
  create extension if not exists dblink with schema extensions;
exception when others then
  raise warning 'dblink not available (%); blocked attempts will go to the Postgres log and the in-transaction fallback only', sqlerrm;
end $$;

create table if not exists security_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  property_id text,
  -- bill_line_tamper, payment_tamper, room_edit_blocked, cross_property_attempt,
  -- guest_flood, room_qr_guessing, room_qr_rate_limited, audit_log_tamper
  kind text not null,
  actor_id uuid,
  actor_email text,
  -- 'user' (signed in), 'guest_or_anonymous' (a guest link or no login), 'service'
  actor_kind text not null default 'guest_or_anonymous',
  -- What was called: /rpc/<function> or /<table> (PostgREST's request path).
  via text,
  ip text,
  user_agent text,
  target_table text,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  -- false when only the in-transaction fallback was used (that row is lost if the statement rolled back)
  autonomous boolean not null default true
);
create index if not exists security_events_property_at on security_events (property_id, id desc);
create index if not exists security_events_kind_at on security_events (kind, at desc);
alter table security_events enable row level security;
revoke all on security_events from anon, authenticated;
grant select on security_events to authenticated;
drop policy if exists security_events_owner_read on security_events;
create policy security_events_owner_read on security_events for select to authenticated
  using ((property_id is not null and is_owner_for_property(property_id)) or is_platform_admin());

create or replace function security_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The security log is append-only';
end;
$$;
drop trigger if exists security_events_immutable on security_events;
create trigger security_events_immutable before update or delete on security_events
for each row execute function security_events_immutable();

-- The login the loopback connection uses: it can add rows to security_events and nothing else.
do $$
declare
  v_pw text := encode(gen_random_bytes(24), 'hex');
  v_conn text;
  v_secret_id uuid;
begin
  if not exists (select 1 from pg_roles where rolname = 'security_logger') then
    execute format('create role security_logger login password %L', v_pw);
  else
    execute format('alter role security_logger login password %L', v_pw);
  end if;
  grant usage on schema public to security_logger;
  grant insert on security_events to security_logger;
  alter role security_logger set statement_timeout = '3s';
  drop policy if exists security_events_logger_insert on security_events;
  create policy security_events_logger_insert on security_events for insert to security_logger with check (true);

  v_conn := format('host=127.0.0.1 port=%s dbname=%s user=security_logger password=%s connect_timeout=2',
                   coalesce(nullif(current_setting('port', true), ''), '5432'), current_database(), v_pw);
  begin
    select id into v_secret_id from vault.secrets where name = 'security_log_conn';
    if v_secret_id is null then
      perform vault.create_secret(v_conn, 'security_log_conn', 'Loopback login for security_events (0089)');
    else
      perform vault.update_secret(v_secret_id, v_conn);
    end if;
  exception when others then
    raise warning 'Could not store the loopback login in Vault (%); the in-transaction fallback will be used', sqlerrm;
  end;
end $$;

-- Writes one event. Never raises (it must not hide or replace the refusal it is
-- reporting) and is throttled so an attacker can't fill the table:
--   p_dedupe_minutes > 0: skip if this same actor/IP already logged this kind for this target in that window
--   at most 300 events a minute overall.
create or replace function security_log(
  p_kind text, p_property text, p_table text, p_target text,
  p_detail jsonb default '{}'::jsonb, p_dedupe_minutes int default 0
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb;
  v_headers jsonb;
  v_actor_kind text;
  v_email text;
  v_ip text;
  v_ua text;
  v_via text := nullif(current_setting('request.path', true), '');
  v_conn text;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then v_claims := null; end;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then v_headers := null; end;
  v_actor_kind := case
    when coalesce(v_claims ->> 'role', '') = 'service_role' then 'service'
    when v_uid is not null then 'user'
    else 'guest_or_anonymous'
  end;
  v_ip := coalesce(
    nullif(trim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '')
  );
  v_ua := left(v_headers ->> 'user-agent', 200);
  if v_uid is not null then
    select email into v_email from auth.users where id = v_uid;
  end if;

  -- Always leaves a line in the Postgres log, even if the table write fails.
  raise warning 'security_event %', jsonb_build_object('kind', p_kind, 'property', p_property, 'table', p_table, 'target', p_target, 'actor', v_uid, 'ip', v_ip, 'via', v_via, 'detail', p_detail)::text;

  if (select count(*) from security_events where at > now() - interval '1 minute') >= 300 then
    return;
  end if;
  if p_dedupe_minutes > 0 and exists (
    select 1 from security_events
    where kind = p_kind and at > now() - make_interval(mins => p_dedupe_minutes)
      and target_id is not distinct from p_target and actor_id is not distinct from v_uid and ip is not distinct from v_ip
  ) then
    return;
  end if;

  begin
    select decrypted_secret into v_conn from vault.decrypted_secrets where name = 'security_log_conn';
    if v_conn is null then
      raise exception 'no loopback login';
    end if;
    perform dblink_exec(v_conn, format(
      'insert into security_events (property_id, kind, actor_id, actor_email, actor_kind, via, ip, user_agent, target_table, target_id, detail, autonomous) values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L::jsonb, true)',
      p_property, p_kind, v_uid, v_email, v_actor_kind, v_via, v_ip, v_ua, p_table, p_target, coalesce(p_detail, '{}'::jsonb)::text));
  exception when others then
    insert into security_events (property_id, kind, actor_id, actor_email, actor_kind, via, ip, user_agent, target_table, target_id, detail, autonomous)
    values (p_property, p_kind, v_uid, v_email, v_actor_kind, v_via, v_ip, v_ua, p_table, p_target, coalesce(p_detail, '{}'::jsonb), false);
  end;
exception when others then
  null;
end;
$$;
revoke all on function security_log(text, text, text, text, jsonb, int) from public, anon, authenticated;

-- Names of the columns whose values differ between two rows.
create or replace function changed_columns(p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
  from jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) k
  where p_new -> k is distinct from p_old -> k
$$;

-- ---------------------------------------------------------------------------
-- Hooks: the refusals from 0072 and 0087, now logged before they raise.
-- The guards become SECURITY DEFINER so they can call security_log, which the
-- API roles can't (otherwise anyone could write fake events).
-- ---------------------------------------------------------------------------
create or replace function folio_charges_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_frozen text[] := array['voided_at', 'void_reason', 'voided_by', 'settled_at', 'payment_method'];
  v_why text;
begin
  if tg_op = 'DELETE' then
    perform security_log('bill_line_tamper', old.property_id, 'folio_charges', old.id::text, jsonb_build_object('attempt', 'delete', 'amount', old.amount, 'description', left(old.description, 80)));
    raise exception 'Bill lines are never deleted; void it instead';
  end if;
  if (to_jsonb(new) - v_frozen) is distinct from (to_jsonb(old) - v_frozen) then
    perform security_log('bill_line_tamper', old.property_id, 'folio_charges', old.id::text, jsonb_build_object('attempt', 'edit', 'columns', changed_columns(to_jsonb(old), to_jsonb(new)), 'old_amount', old.amount, 'new_amount', new.amount));
    raise exception 'A posted bill line can''t be changed; void it and post a new one';
  end if;
  if old.voided_at is not null then
    if (new.voided_at, new.void_reason, new.voided_by) is distinct from (old.voided_at, old.void_reason, old.voided_by) then
      perform security_log('bill_line_tamper', old.property_id, 'folio_charges', old.id::text, jsonb_build_object('attempt', 'rewrite_void'));
      raise exception 'A voided line stays voided, with its reason and who voided it';
    end if;
  elsif new.voided_at is not null then
    if length(trim(coalesce(new.void_reason, ''))) = 0 then
      perform security_log('bill_line_tamper', old.property_id, 'folio_charges', old.id::text, jsonb_build_object('attempt', 'void_without_reason'));
      raise exception 'Say why this line is being voided';
    end if;
    -- The voider is the signed-in login, never a value the caller supplies.
    if auth.uid() is not null then
      new.voided_by := auth.uid();
    end if;
  elsif new.void_reason is distinct from old.void_reason or new.voided_by is distinct from old.voided_by then
    perform security_log('bill_line_tamper', old.property_id, 'folio_charges', old.id::text, jsonb_build_object('attempt', 'forge_void_fields'));
    raise exception 'A void reason can only be set when voiding';
  end if;
  if old.settled_at is not null and (new.settled_at, new.payment_method) is distinct from (old.settled_at, old.payment_method) then
    perform security_log('bill_line_tamper', old.property_id, 'folio_charges', old.id::text, jsonb_build_object('attempt', 'change_settlement'));
    raise exception 'A settled line''s settlement can''t be changed';
  end if;
  return new;
end;
$$;

create or replace function folio_payments_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_frozen text[] := array['voided_at', 'void_reason', 'voided_by'];
begin
  if tg_op = 'DELETE' then
    perform security_log('payment_tamper', old.property_id, 'folio_payments', old.id::text, jsonb_build_object('attempt', 'delete', 'amount', old.amount));
    raise exception 'Payments are never deleted; void it instead';
  end if;
  if (to_jsonb(new) - v_frozen) is distinct from (to_jsonb(old) - v_frozen) then
    perform security_log('payment_tamper', old.property_id, 'folio_payments', old.id::text, jsonb_build_object('attempt', 'edit', 'columns', changed_columns(to_jsonb(old), to_jsonb(new)), 'old_amount', old.amount, 'new_amount', new.amount));
    raise exception 'A recorded payment can''t be changed; void it and record it again';
  end if;
  if old.voided_at is not null then
    if (new.voided_at, new.void_reason, new.voided_by) is distinct from (old.voided_at, old.void_reason, old.voided_by) then
      perform security_log('payment_tamper', old.property_id, 'folio_payments', old.id::text, jsonb_build_object('attempt', 'rewrite_void'));
      raise exception 'A voided payment stays voided, with its reason and who voided it';
    end if;
  elsif new.voided_at is not null then
    if length(trim(coalesce(new.void_reason, ''))) = 0 then
      perform security_log('payment_tamper', old.property_id, 'folio_payments', old.id::text, jsonb_build_object('attempt', 'void_without_reason'));
      raise exception 'Say why this payment is being voided';
    end if;
    if auth.uid() is not null then
      new.voided_by := auth.uid();
    end if;
  elsif new.void_reason is distinct from old.void_reason or new.voided_by is distinct from old.voided_by then
    perform security_log('payment_tamper', old.property_id, 'folio_payments', old.id::text, jsonb_build_object('attempt', 'forge_void_fields'));
    raise exception 'A void reason can only be set when voiding';
  end if;
  return new;
end;
$$;

create or replace function rooms_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ops text[] := array['status', 'notes', 'clean_progress', 'maintenance_eta', 'issue_description'];
begin
  if new.property_id is distinct from old.property_id then
    perform security_log('cross_property_attempt', old.property_id, 'rooms', old.id::text, jsonb_build_object('attempt', 'move_room', 'to_property', new.property_id));
    raise exception 'A room can''t be moved to another property';
  end if;
  if auth.uid() is not null and not is_owner_for_property(old.property_id)
     and (to_jsonb(new) - v_ops) is distinct from (to_jsonb(old) - v_ops) then
    perform security_log('room_edit_blocked', old.property_id, 'rooms', old.id::text, jsonb_build_object('room', old.number, 'columns', changed_columns(to_jsonb(old), to_jsonb(new)), 'old_price', old.price_per_night, 'new_price', new.price_per_night));
    raise exception 'Only the owner can change a room''s details, price or QR code';
  end if;
  return new;
end;
$$;

create or replace function staff_update_arrival_eta(p_reservation_id uuid, p_new_eta timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation reservations%rowtype;
begin
  select * into v_reservation from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reservation not found';
  end if;
  if not is_staff_for_property(v_reservation.property_id) then
    perform security_log('cross_property_attempt', v_reservation.property_id, 'reservations', p_reservation_id::text, jsonb_build_object('attempt', 'update_eta'), 10);
    raise exception 'Not authorized for this property';
  end if;
  if v_reservation.status <> 'upcoming' then
    raise exception 'Can only update ETA for an upcoming arrival';
  end if;

  update reservations set updated_eta = p_new_eta where id = p_reservation_id;
end;
$$;

create or replace function guest_flood_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_max integer;
  v_window integer;
begin
  if auth.uid() is not null then
    return new;
  end if;
  if tg_table_name = 'folio_chat_messages' then
    if new.sender <> 'guest' then
      return new;
    end if;
    v_key := 'chat:' || new.reservation_id; v_max := 30; v_window := 600;
  elsif tg_table_name = 'guest_requests' then
    if new.reservation_id is null then
      return new;
    end if;
    v_key := 'request:' || new.reservation_id; v_max := 20; v_window := 3600;
  elsif tg_table_name = 'orders' then
    v_key := 'order:' || new.reservation_id; v_max := 20; v_window := 3600;
  elsif tg_table_name = 'experience_bookings' then
    v_key := 'booking:' || new.reservation_id; v_max := 20; v_window := 3600;
  else
    return new;
  end if;
  if not check_rate_limit(v_key, v_max, v_window) then
    perform security_log('guest_flood', to_jsonb(new) ->> 'property_id', tg_table_name, new.reservation_id::text, jsonb_build_object('limit', v_max, 'window_seconds', v_window), 10);
    raise exception 'You''re doing that a lot. Please wait a few minutes and try again.';
  end if;
  return new;
end;
$$;

create or replace function audit_log_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform security_log('audit_log_tamper', old.property_id, 'audit_log', old.id::text, jsonb_build_object('attempt', lower(tg_op)));
  raise exception 'The audit log is append-only';
end;
$$;

create or replace function audit_log_no_truncate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform security_log('audit_log_tamper', null, 'audit_log', null, jsonb_build_object('attempt', 'truncate'));
  raise exception 'The audit log is append-only';
end;
$$;

-- Room QR lookups: the two refusals (too many misses from this caller, too many
-- lookups of one room) are the signature of someone guessing room codes.
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
  v_room_exists boolean;
  v_token uuid;
begin
  -- Who is calling. NULL outside a PostgREST request (e.g. SQL editor),
  -- in which case only the per-room limit applies.
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
      perform security_log('room_qr_guessing', null, 'rooms', null, jsonb_build_object('last_room_id', left(p_room_id, 64)), 10);
      raise exception 'Too many attempts — wait a few minutes and try again';
    end if;
  end if;

  select exists (select 1 from rooms where id = p_room_id) into v_room_exists;

  if v_room_exists then
    if not check_rate_limit('resolve_room:' || p_room_id, 20, 60) then
      perform security_log('room_qr_rate_limited', (select property_id from rooms where id = p_room_id), 'rooms', p_room_id, '{}'::jsonb, 10);
      raise exception 'Too many attempts for this room — wait a minute and try again';
    end if;

    select r.guest_token into v_token
    from reservations r
    where r.room_id = p_room_id and r.status = 'checked_in'
    order by r.created_at desc
    limit 1;
  end if;

  if v_token is null and v_ip_bucket is not null then
    insert into rate_limit_hits (bucket_key) values (v_ip_bucket);
  end if;

  -- NULL = no such room, or no one checked in. Not an exception, so the
  -- hits recorded above are kept.
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- Direct writes to the tables nobody writes directly
-- ---------------------------------------------------------------------------
-- Staff have read-only access to bill lines, payments, stays, invoices, day
-- closes and the audit log, so a direct PATCH/DELETE/POST there doesn't error:
-- Row Level Security quietly matches zero rows and no trigger ever runs. The
-- app never does this (money and stays change only through the checked
-- functions), so a request like that is an attempt by definition.
--
-- PostgREST calls this before every API request (pgrst.db_pre_request). It
-- returns at once for reads and function calls, and it can never fail a
-- request: any problem inside is swallowed.
create or replace function api_pre_request()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_method text := current_setting('request.method', true);
  v_path text;
  v_claims jsonb;
  v_property text;
  v_count int;
begin
  if v_method is null or v_method in ('GET', 'HEAD', 'OPTIONS') then
    return;
  end if;
  v_path := current_setting('request.path', true);
  if v_path is null
     or not (v_path in ('/folio_charges', '/folio_payments', '/reservations', '/invoices', '/day_closes', '/audit_log', '/security_events')
             or (v_path = '/orders' and v_method <> 'PATCH')) then
    return;
  end if;
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  if coalesce(v_claims ->> 'role', '') = 'service_role' then
    return;
  end if;
  if auth.uid() is not null then
    select count(*), min(property_id) into v_count, v_property from staff_properties where user_id = auth.uid();
    if v_count <> 1 then v_property := null; end if;
  end if;
  perform security_log('direct_write_blocked', v_property, ltrim(v_path, '/'), null, jsonb_build_object('method', v_method), 5);
exception when others then
  null;
end;
$$;
revoke all on function api_pre_request() from public;
grant execute on function api_pre_request() to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    alter role authenticator set pgrst.db_pre_request = 'public.api_pre_request';
    notify pgrst, 'reload config';
  end if;
exception when others then
  raise warning 'Could not register the pre-request hook (%); direct writes will not be logged', sqlerrm;
end $$;
