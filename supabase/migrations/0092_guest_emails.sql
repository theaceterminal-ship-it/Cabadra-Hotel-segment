-- 0092: emails to guests, sent automatically.
--
--   booking_confirmation  a minute after an advance booking is made (hotel details,
--                         dates, directions, call button, add to calendar)
--   checkout_thanks       90 minutes after check-out (a warm thank-you in the hotel's voice
--                         and a link to the hotel's own Google review page)
--
-- Nothing in the app sends these. A trigger puts a row on guest_email_outbox; a
-- pg_cron job (every minute, only when something is due) calls the guest-emails-send
-- Edge Function, which writes and sends them. One row per stay and kind, so a booking
-- is never emailed twice, and a stay that is cancelled or checked in before its
-- confirmation goes out never sends it.
--
-- Who it comes from: "Hotel Name via Cabadra" with replies going to the hotel, unless
-- the hotel has verified its own domain (property_email_domains), in which case it comes
-- from there. If the own-domain send fails, the same email goes out the Cabadra way.
--
-- Settings are the owner's (owner_update_guest_email_settings); the own-domain table is
-- written only by the Edge Function, so no one can claim another hotel's verified domain.
--
-- Apply after 0001-0091. Needs the Vault secrets project_url and
-- id_document_purge_cron_secret (already there since 0068; the same value is CRON_SECRET).

-- ---------------------------------------------------------------------------
-- 1. What the owner can set
-- ---------------------------------------------------------------------------
alter table properties
  add column if not exists guest_emails_enabled boolean not null default true,
  add column if not exists maps_url text,
  add column if not exists check_in_time text,
  add column if not exists check_out_time text,
  add column if not exists welcome_note text,
  add column if not exists thanks_note text,
  add column if not exists google_review_url text;

create or replace function owner_update_guest_email_settings(p_property_id text, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_maps text := nullif(trim(p_settings->>'mapsUrl'), '');
  v_review text := nullif(trim(p_settings->>'googleReviewUrl'), '');
  v_in text := nullif(trim(p_settings->>'checkInTime'), '');
  v_out text := nullif(trim(p_settings->>'checkOutTime'), '');
  v_welcome text := nullif(trim(p_settings->>'welcomeNote'), '');
  v_thanks text := nullif(trim(p_settings->>'thanksNote'), '');
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only the property owner can change guest email settings';
  end if;
  if v_maps is not null and (v_maps !~* '^https://[^\s]+$' or length(v_maps) > 500) then
    raise exception 'The map link should start with https:// (copy it from Google Maps: Share, Copy link)';
  end if;
  if v_review is not null and (v_review !~* '^https://[^\s]+$' or length(v_review) > 500) then
    raise exception 'The review link should start with https:// (your Google Business profile has a "Get more reviews" link)';
  end if;
  if v_in is not null and v_in !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Check-in time should look like 14:00';
  end if;
  if v_out is not null and v_out !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Check-out time should look like 11:00';
  end if;
  if length(coalesce(v_welcome, '')) > 500 or length(coalesce(v_thanks, '')) > 500 then
    raise exception 'Notes can be up to 500 characters';
  end if;
  update properties set
    guest_emails_enabled = coalesce((p_settings->>'enabled')::boolean, true),
    maps_url = v_maps,
    check_in_time = v_in,
    check_out_time = v_out,
    welcome_note = v_welcome,
    thanks_note = v_thanks,
    google_review_url = v_review
  where id = p_property_id;
end;
$$;
revoke all on function owner_update_guest_email_settings(text, jsonb) from public, anon;
grant execute on function owner_update_guest_email_settings(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A hotel's own sending domain. Written only by the property-guest-email function.
-- ---------------------------------------------------------------------------
create table if not exists property_email_domains (
  property_id text primary key references properties(id) on delete cascade,
  domain text not null unique,
  local_part text not null default 'bookings' check (local_part ~ '^[a-z0-9._-]{1,40}$'),
  resend_domain_id text,
  -- not_started / pending / verified / failed (as the email service reports it)
  status text not null default 'pending',
  -- the DNS records the owner has to add: [{record, type, name, value, priority, status}]
  records jsonb not null default '[]'::jsonb,
  last_error text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  checked_at timestamptz
);
alter table property_email_domains enable row level security;
revoke all on property_email_domains from anon, authenticated;
grant select on property_email_domains to authenticated;
drop policy if exists property_email_domains_owner_read on property_email_domains;
create policy property_email_domains_owner_read on property_email_domains for select to authenticated
  using (is_owner_for_property(property_id) or is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. The queue
-- ---------------------------------------------------------------------------
create table if not exists guest_email_outbox (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references reservations(id) on delete cascade,
  property_id text not null,
  kind text not null check (kind in ('booking_confirmation', 'checkout_thanks')),
  due_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  -- 'cabadra' (Hotel via Cabadra) or 'own_domain'
  sent_via text,
  error text,
  created_at timestamptz not null default now(),
  unique (reservation_id, kind)
);
create index if not exists guest_email_outbox_due on guest_email_outbox (due_at) where status = 'pending';
create index if not exists guest_email_outbox_property on guest_email_outbox (property_id, id desc);
alter table guest_email_outbox enable row level security;
revoke all on guest_email_outbox from anon, authenticated;

create or replace function guest_email_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- An advance booking made in Cabadra. (A walk-in that checks straight in gets the room
    -- service code email instead; a booking that lives in the hotel's own PMS is its PMS's to confirm.)
    if new.status = 'upcoming' and new.source = 'built_in' then
      insert into guest_email_outbox (reservation_id, property_id, kind, due_at)
      values (new.id, new.property_id, 'booking_confirmation', now() + interval '1 minute')
      on conflict (reservation_id, kind) do nothing;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('cancelled', 'checked_in') then
      update guest_email_outbox set status = 'skipped', error = 'the stay changed before this went out'
      where reservation_id = new.id and kind = 'booking_confirmation' and status = 'pending';
    end if;
    if new.status = 'checked_out' then
      insert into guest_email_outbox (reservation_id, property_id, kind, due_at)
      values (new.id, new.property_id, 'checkout_thanks', now() + interval '90 minutes')
      on conflict (reservation_id, kind) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function guest_email_enqueue() from public, anon, authenticated;
drop trigger if exists guest_email_enqueue_insert on reservations;
create trigger guest_email_enqueue_insert after insert on reservations
  for each row execute function guest_email_enqueue();
drop trigger if exists guest_email_enqueue_update on reservations;
create trigger guest_email_enqueue_update after update of status on reservations
  for each row execute function guest_email_enqueue();

-- ---------------------------------------------------------------------------
-- 4. For the Edge Function only (service role)
-- ---------------------------------------------------------------------------
-- Takes the due rows, so two runs never send the same email. A row stuck in
-- 'sending' for 10 minutes (the function died) goes back in the queue.
create or replace function system_claim_guest_emails(p_limit integer default 20)
returns table (id bigint, kind text, reservation_id uuid, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  update guest_email_outbox o set status = 'pending'
  where o.status = 'sending' and o.claimed_at < now() - interval '10 minutes';
  return query
  with due as (
    select o.id from guest_email_outbox o
    where o.status = 'pending' and o.due_at <= now()
    order by o.due_at limit greatest(p_limit, 1)
    for update skip locked
  )
  update guest_email_outbox o set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
  from due where o.id = due.id
  returning o.id, o.kind, o.reservation_id, o.attempts;
end;
$$;
revoke all on function system_claim_guest_emails(integer) from public, anon, authenticated;
grant execute on function system_claim_guest_emails(integer) to service_role;

-- Everything the templates need for one stay.
create or replace function system_guest_email_context(p_reservation_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reservation', jsonb_build_object(
      'id', r.id, 'status', r.status, 'source', r.source, 'booking_ref', r.booking_ref,
      'check_in', r.check_in, 'check_out', r.check_out, 'party_size', r.party_size, 'rate_per_night', r.rate_per_night
    ),
    'guest', jsonb_build_object('name', g.name, 'email', nullif(trim(g.email), '')),
    'room', jsonb_build_object('number', rm.number, 'type', rm.type),
    'property', jsonb_build_object(
      'id', p.id, 'name', p.name, 'location', p.location, 'image', p.image, 'currency', p.currency,
      'enabled', p.guest_emails_enabled,
      'address', coalesce(p.billing_address, p.location), 'phone', p.billing_phone, 'reply_to', p.billing_email,
      'maps_url', p.maps_url, 'check_in_time', p.check_in_time, 'check_out_time', p.check_out_time,
      'welcome_note', p.welcome_note, 'thanks_note', p.thanks_note, 'google_review_url', p.google_review_url
    ),
    'domain', (select jsonb_build_object('domain', d.domain, 'local_part', d.local_part)
               from property_email_domains d where d.property_id = p.id and d.status = 'verified')
  )
  from reservations r
  join guests g on g.id = r.guest_id
  join rooms rm on rm.id = r.room_id
  join properties p on p.id = r.property_id
  where r.id = p_reservation_id
$$;
revoke all on function system_guest_email_context(uuid) from public, anon, authenticated;
grant execute on function system_guest_email_context(uuid) to service_role;

create or replace function system_guest_email_done(p_id bigint, p_status text, p_error text default null, p_via text default null, p_retry_minutes integer default null)
returns void
language sql
security definer
set search_path = public
as $$
  update guest_email_outbox
  set status = case when p_status = 'retry' then 'pending' else p_status end,
      error = left(p_error, 300),
      sent_via = coalesce(p_via, sent_via),
      sent_at = case when p_status = 'sent' then now() else sent_at end,
      due_at = case when p_status = 'retry' then now() + make_interval(mins => coalesce(p_retry_minutes, 10)) else due_at end
  where id = p_id
$$;
revoke all on function system_guest_email_done(bigint, text, text, text, integer) from public, anon, authenticated;
grant execute on function system_guest_email_done(bigint, text, text, text, integer) to service_role;

-- A small allowance for the owner's "send me a test" button: p_max per p_window_seconds.
create or replace function system_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  select check_rate_limit(p_key, p_max, p_window_seconds)
$$;
revoke all on function system_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function system_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. The owner's view of what has gone out (last 15, no email addresses)
-- ---------------------------------------------------------------------------
create or replace function owner_guest_email_log(p_property_id text)
returns table (id bigint, kind text, status text, guest_name text, due_at timestamptz, sent_at timestamptz, sent_via text, error text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only the property owner can see this';
  end if;
  return query
  select o.id, o.kind, o.status, g.name, o.due_at, o.sent_at, o.sent_via, o.error
  from guest_email_outbox o
  join reservations r on r.id = o.reservation_id
  join guests g on g.id = r.guest_id
  where o.property_id = p_property_id
  order by o.id desc limit 15;
end;
$$;
revoke all on function owner_guest_email_log(text) from public, anon;
grant execute on function owner_guest_email_log(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The minute-by-minute sender: only calls out when something is due.
-- ---------------------------------------------------------------------------
select cron.unschedule('send-guest-emails')
where exists (select 1 from cron.job where jobname = 'send-guest-emails');

select cron.schedule(
  'send-guest-emails',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/guest-emails-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'id_document_purge_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where exists (select 1 from guest_email_outbox where status = 'pending' and due_at <= now())
  $$
);
