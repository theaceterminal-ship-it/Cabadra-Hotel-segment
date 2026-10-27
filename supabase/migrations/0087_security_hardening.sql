-- Security hardening, from an audit of the live database (Oct 2026).
--
-- What the audit found, and what this migration does about it:
--
--   1. No audit trail. Nothing recorded who changed a reservation, an order,
--      a room's price, a menu price, a staff member or a bill line, and
--      folio_charges had no "posted by". -> audit_log (append-only, written by
--      triggers, readable by the property's owners), plus folio_charges
--      posted_by / posted_via.
--   2. Any staff account, a receptionist included, could write straight to
--      reservations, orders, rooms, menu_items, experiences, service
--      categories, transport routes and the staff directory through the table
--      API, skipping every checked function: check a guest out with a balance
--      due, rewrite an order's total, delete an order or a reservation (and
--      with it the guest's chat and bookings), change a room or dish price.
--      Nothing in the browser relies on that. -> reservations are written only
--      by functions; orders can only have their status changed directly; room
--      details, menu, experiences, services, routes and the staff directory
--      are owner-only; chat messages can't be edited or deleted.
--   3. Bill lines and payments: the guards stopped changing an amount but not a
--      description, and let "who voided it and why" be rewritten after the
--      fact. -> everything is frozen except a one-time void (reason required,
--      voider stamped from the login, not from the caller) and settlement.
--   4. Guest-originated writes had no rate limit and chat had no length cap:
--      anyone holding a guest link could flood the front desk or bloat the
--      database. -> per-stay limits and a 2000-character cap.
--   5. guest_verify_otp "verified" a guest without checking any code, and
--      nothing used it. -> dropped.
--   6. The anonymous role held every privilege on 13 tables (row level security
--      was the only guard) and everyone could run trigger functions. -> anon
--      has no table privileges; guests use the guest_* functions only.
--   7. The partner-photos bucket had no size or type limit. -> 5 MB, images.
-- Apply after 0001-0086.

-- ---------------------------------------------------------------------------
-- 1. Audit trail
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  property_id text,
  table_name text not null,
  row_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid,
  actor_email text,
  -- 'user' = a signed-in account; 'guest_or_system' = a guest's link, a department
  -- or kitchen screen, or a scheduled job; 'service' = the server itself.
  actor_kind text not null check (actor_kind in ('user', 'guest_or_system', 'service')),
  -- What was called: /rpc/<function> or /<table> (PostgREST's request path).
  via text,
  ip text,
  -- UPDATE: {column: {old, new}}. INSERT: the new row. DELETE: the old row.
  changes jsonb
);
create index if not exists audit_log_property_at on audit_log (property_id, id desc);
create index if not exists audit_log_row on audit_log (table_name, row_id);
alter table audit_log enable row level security;
revoke all on audit_log from anon, authenticated;
grant select on audit_log to authenticated;
drop policy if exists audit_log_owner_read on audit_log;
create policy audit_log_owner_read on audit_log for select to authenticated
  using ((property_id is not null and is_owner_for_property(property_id)) or is_platform_admin());

-- Records are never edited or removed.
create or replace function audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The audit log is append-only';
end;
$$;
drop trigger if exists audit_log_immutable on audit_log;
create trigger audit_log_immutable before update or delete on audit_log
for each row execute function audit_log_immutable();
create or replace function audit_log_no_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The audit log is append-only';
end;
$$;
drop trigger if exists audit_log_no_truncate on audit_log;
create trigger audit_log_no_truncate before truncate on audit_log
for each statement execute function audit_log_no_truncate();

-- One trigger function for every audited table. Tokens, QR codes and ID
-- photos are never copied into the log (a changed one just says so).
create or replace function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hidden text[] := array['guest_token', 'badge_token', 'token', 'qr_code', 'share_token', 'id_document_url', 'snapshot'];
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_changes jsonb;
  v_key text;
  v_uid uuid := auth.uid();
  v_claims jsonb;
  v_headers jsonb;
  v_kind text;
  v_ip text;
  v_row_id text;
  v_property text;
begin
  if tg_op = 'INSERT' then
    v_row := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row := v_new;
    v_changes := '{}'::jsonb;
    for v_key in select jsonb_object_keys(v_new) loop
      if v_new -> v_key is distinct from v_old -> v_key then
        v_changes := v_changes || jsonb_build_object(
          v_key,
          case when v_key = any (v_hidden) then jsonb_build_object('changed', true)
               else jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key) end
        );
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;
  if tg_op <> 'UPDATE' then
    v_changes := v_row - v_hidden;
  end if;

  v_property := case when tg_table_name = 'properties' then v_row ->> 'id' else v_row ->> 'property_id' end;
  v_row_id := coalesce(v_row ->> 'id', concat_ws('/', v_row ->> 'user_id', v_row ->> 'property_id'));

  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_kind := case
    when coalesce(v_claims ->> 'role', '') = 'service_role' then 'service'
    when v_uid is not null then 'user'
    else 'guest_or_system'
  end;
  v_ip := coalesce(
    nullif(trim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '')
  );

  insert into audit_log (property_id, table_name, row_id, action, actor_id, actor_email, actor_kind, via, ip, changes)
  values (
    v_property, tg_table_name, v_row_id, tg_op, v_uid,
    case when v_uid is not null then (select email from auth.users where id = v_uid) end,
    v_kind, nullif(current_setting('request.path', true), ''), v_ip, v_changes
  );
  return null;
end;
$$;
revoke all on function audit_row_change() from public, anon, authenticated;

-- Everything that holds money, access or configuration. High-volume
-- operational tables (tasks, requests, notifications, chat) are left out,
-- except that a DELETE on them is always recorded (below).
do $$
declare
  t text;
begin
  foreach t in array array[
    'reservations', 'orders', 'rooms', 'menu_items', 'folio_charges', 'folio_payments', 'invoices', 'day_closes',
    'guests', 'experiences', 'experience_bookings', 'staff_properties', 'staff_directory', 'properties',
    'department_displays', 'property_access_links', 'pending_staff_invites', 'service_categories',
    'transport_routes', 'shifts'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_row_change on %I', t);
      execute format('create trigger audit_row_change after insert or update or delete on %I for each row execute function audit_row_change()', t);
    end if;
  end loop;
  foreach t in array array['folio_chat_messages', 'guest_requests', 'tasks'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_row_delete on %I', t);
      execute format('create trigger audit_row_delete after delete on %I for each row execute function audit_row_change()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Bill lines and payments: who posted, and nothing rewritable afterwards
-- ---------------------------------------------------------------------------
alter table folio_charges
  add column if not exists posted_by uuid,
  add column if not exists posted_via text;

create or replace function folio_charge_stamp()
returns trigger
language plpgsql
as $$
declare
  v_claims jsonb;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  new.posted_by := auth.uid();
  new.posted_via := case
    when coalesce(v_claims ->> 'role', '') = 'service_role' then 'service'
    when auth.uid() is not null then 'staff'
    else 'guest_or_system'
  end;
  return new;
end;
$$;
drop trigger if exists folio_charge_stamp on folio_charges;
create trigger folio_charge_stamp before insert on folio_charges
for each row execute function folio_charge_stamp();

-- A posted line can be voided once (with a reason, stamped with whoever's
-- login did it) and settled once. Nothing else about it can change.
create or replace function folio_charges_guard()
returns trigger
language plpgsql
as $$
declare
  v_frozen text[] := array['voided_at', 'void_reason', 'voided_by', 'settled_at', 'payment_method'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Bill lines are never deleted; void it instead';
  end if;
  if (to_jsonb(new) - v_frozen) is distinct from (to_jsonb(old) - v_frozen) then
    raise exception 'A posted bill line can''t be changed; void it and post a new one';
  end if;
  if old.voided_at is not null then
    if (new.voided_at, new.void_reason, new.voided_by) is distinct from (old.voided_at, old.void_reason, old.voided_by) then
      raise exception 'A voided line stays voided, with its reason and who voided it';
    end if;
  elsif new.voided_at is not null then
    if length(trim(coalesce(new.void_reason, ''))) = 0 then
      raise exception 'Say why this line is being voided';
    end if;
    -- The voider is the signed-in login, never a value the caller supplies.
    if auth.uid() is not null then
      new.voided_by := auth.uid();
    end if;
  elsif new.void_reason is distinct from old.void_reason or new.voided_by is distinct from old.voided_by then
    raise exception 'A void reason can only be set when voiding';
  end if;
  if old.settled_at is not null and (new.settled_at, new.payment_method) is distinct from (old.settled_at, old.payment_method) then
    raise exception 'A settled line''s settlement can''t be changed';
  end if;
  return new;
end;
$$;

create or replace function folio_payments_guard()
returns trigger
language plpgsql
as $$
declare
  v_frozen text[] := array['voided_at', 'void_reason', 'voided_by'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Payments are never deleted; void it instead';
  end if;
  if (to_jsonb(new) - v_frozen) is distinct from (to_jsonb(old) - v_frozen) then
    raise exception 'A recorded payment can''t be changed; void it and record it again';
  end if;
  if old.voided_at is not null then
    if (new.voided_at, new.void_reason, new.voided_by) is distinct from (old.voided_at, old.void_reason, old.voided_by) then
      raise exception 'A voided payment stays voided, with its reason and who voided it';
    end if;
  elsif new.voided_at is not null then
    if length(trim(coalesce(new.void_reason, ''))) = 0 then
      raise exception 'Say why this payment is being voided';
    end if;
    if auth.uid() is not null then
      new.voided_by := auth.uid();
    end if;
  elsif new.void_reason is distinct from old.void_reason or new.voided_by is distinct from old.voided_by then
    raise exception 'A void reason can only be set when voiding';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Close the direct-write doors staff never needed
-- ---------------------------------------------------------------------------
-- Reservations: read by staff, written only by the checked functions.
drop policy if exists "staff can manage reservations on their property" on reservations;
drop policy if exists "staff can view reservations on their property" on reservations;
create policy "staff can view reservations on their property" on reservations
  for select using (is_staff_for_property(property_id));

-- The one function that wrote reservations as the caller, now checked and elevated.
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
    raise exception 'Not authorized for this property';
  end if;
  if v_reservation.status <> 'upcoming' then
    raise exception 'Can only update ETA for an upcoming arrival';
  end if;

  update reservations set updated_eta = p_new_eta where id = p_reservation_id;
end;
$$;
revoke all on function staff_update_arrival_eta(uuid, timestamptz) from public, anon;
grant execute on function staff_update_arrival_eta(uuid, timestamptz) to authenticated;

-- Orders: staff read them and move their status; amounts, items and rows are
-- written only by the ordering and rejection functions.
drop policy if exists "staff can manage orders on their property" on orders;
drop policy if exists "staff can view orders on their property" on orders;
drop policy if exists "staff can update order status on their property" on orders;
create policy "staff can view orders on their property" on orders
  for select using (is_staff_for_property(property_id));
create policy "staff can update order status on their property" on orders
  for update using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));
revoke insert, update, delete on orders from authenticated;
grant update (status) on orders to authenticated;

-- Rooms: everyone on staff sees them and moves their status fields; the room's
-- details, price and QR are the owner's, and a room never changes hotels.
drop policy if exists "staff can manage rooms on their property" on rooms;
drop policy if exists "staff can view rooms on their property" on rooms;
drop policy if exists "staff can update rooms on their property" on rooms;
drop policy if exists "owners can add rooms" on rooms;
drop policy if exists "owners can delete rooms" on rooms;
create policy "staff can view rooms on their property" on rooms
  for select using (is_staff_for_property(property_id));
create policy "staff can update rooms on their property" on rooms
  for update using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));
create policy "owners can add rooms" on rooms
  for insert with check (is_owner_for_property(property_id));
create policy "owners can delete rooms" on rooms
  for delete using (is_owner_for_property(property_id));

create or replace function rooms_guard()
returns trigger
language plpgsql
as $$
declare
  v_ops text[] := array['status', 'notes', 'clean_progress', 'maintenance_eta', 'issue_description'];
begin
  if new.property_id is distinct from old.property_id then
    raise exception 'A room can''t be moved to another property';
  end if;
  if auth.uid() is not null and not is_owner_for_property(old.property_id)
     and (to_jsonb(new) - v_ops) is distinct from (to_jsonb(old) - v_ops) then
    raise exception 'Only the owner can change a room''s details, price or QR code';
  end if;
  return new;
end;
$$;
drop trigger if exists rooms_guard on rooms;
create trigger rooms_guard before update on rooms
for each row execute function rooms_guard();

-- What the hotel sells and who works there is the owner's to edit.
do $$
declare
  r record;
begin
  for r in select * from (values
    ('menu_items', 'staff can manage menu on their property', 'menu'),
    ('experiences', 'staff can manage experiences on their property', 'experiences'),
    ('service_categories', 'staff can manage service categories on their property', 'service categories'),
    ('transport_routes', 'staff can manage transport routes on their property', 'transport routes'),
    ('staff_directory', 'staff can manage the directory on their property', 'the staff directory')
  ) as x(tbl, old_policy, label) loop
    execute format('drop policy if exists %I on %I', r.old_policy, r.tbl);
    execute format('drop policy if exists %I on %I', 'staff can view ' || r.label || ' on their property', r.tbl);
    execute format('drop policy if exists %I on %I', 'owners can manage ' || r.label, r.tbl);
    execute format('create policy %I on %I for select using (is_staff_for_property(property_id))', 'staff can view ' || r.label || ' on their property', r.tbl);
    execute format('create policy %I on %I for all using (is_owner_for_property(property_id)) with check (is_owner_for_property(property_id))', 'owners can manage ' || r.label, r.tbl);
  end loop;
end $$;

-- Chat is a record: staff read it and add their own messages, nobody edits or
-- removes one (seen receipts go through functions).
drop policy if exists "staff can view and send messages on their property" on folio_chat_messages;
drop policy if exists "staff can view chat messages on their property" on folio_chat_messages;
drop policy if exists "staff can send chat messages on their property" on folio_chat_messages;
create policy "staff can view chat messages on their property" on folio_chat_messages
  for select using (is_staff_for_property(property_id));
create policy "staff can send chat messages on their property" on folio_chat_messages
  for insert with check (is_staff_for_property(property_id) and sender = 'staff');
revoke update, delete on folio_chat_messages from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Abuse limits on what a guest's link can write
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'folio_chat_body_length') then
    alter table folio_chat_messages add constraint folio_chat_body_length check (length(body) <= 2000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'guest_requests_title_length') then
    alter table guest_requests add constraint guest_requests_title_length check (length(title) <= 500) not valid;
  end if;
end $$;

-- Per stay, for writes that come from a guest's link (no signed-in user):
-- 30 chat messages / 10 min, 20 requests / hour, 20 orders / hour,
-- 20 experience bookings / hour. Staff aren't throttled.
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
    raise exception 'You''re doing that a lot. Please wait a few minutes and try again.';
  end if;
  return new;
end;
$$;
revoke all on function guest_flood_guard() from public, anon, authenticated;
do $$
declare
  t text;
begin
  foreach t in array array['folio_chat_messages', 'guest_requests', 'orders', 'experience_bookings'] loop
    execute format('drop trigger if exists guest_flood_guard on %I', t);
    execute format('create trigger guest_flood_guard before insert on %I for each row execute function guest_flood_guard()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. A stub that verified nobody
-- ---------------------------------------------------------------------------
drop function if exists guest_verify_otp(uuid, text);

-- ---------------------------------------------------------------------------
-- 6. Least privilege
-- ---------------------------------------------------------------------------
-- A logged-out visitor has no business with any table: guests use the guest_*
-- functions, which run with their own checks.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Trigger functions are not meant to be called by anyone.
do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as fn from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Uploads to our own storage
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'partner-photos';
