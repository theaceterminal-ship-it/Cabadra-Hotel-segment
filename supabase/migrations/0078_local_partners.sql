-- Local partners: paid listings for nearby businesses (cafés, taxis, treks,
-- spas, shops) shown to guests in an "Around {place}" row.
--
-- Who does what:
--   * Cabadra (platform admins, through the local-only Cabadra Pulse app)
--     adds every business, picks where it shows, and records the flat
--     monthly fee it paid. A listing shows only while it's active, started,
--     and paid up (paid_until >= today), so it switches itself off when the
--     month runs out.
--   * Each hotel owner can turn partner listings off for their property, or
--     block categories. Restaurants and cafés are blocked by default, since
--     they compete with the hotel's own in-room dining.
--   * Guests only see a listing and contact the business themselves (call,
--     WhatsApp, directions, an offer code). No guest data goes to the
--     business. What they do is counted in partner_events, which is the
--     report a business is sold on.
--
-- Targeting: a partner lists areas, each a place ("kasauli") or a district
-- ("shimla"); a property matches when any part of its location ("Kasauli,
-- Solan" -> kasauli, solan) is in that list. Naming specific hotels in
-- partner_properties overrides the areas. A hotel's own block always wins.
--
-- platform_admins is seeded by hand (no policy lets anyone write it).
-- Apply after 0001-0077.

create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;
revoke all on platform_admins from anon, authenticated;

create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;
revoke all on function is_platform_admin() from public;
grant execute on function is_platform_admin() to authenticated;

-- The day a listing is judged by: India, where the hotels are.
create or replace function partner_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Kolkata')::date; $$;

-- "Kasauli, Solan" -> {kasauli, solan}
create or replace function location_area_parts(p_location text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(lower(trim(part))) filter (where trim(part) <> ''), '{}')
  from unnest(string_to_array(coalesce(p_location, ''), ',')) as part;
$$;

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  category text not null check (category in ('restaurant', 'cafe', 'taxi', 'tours', 'adventure', 'spa', 'shopping', 'other')),
  tagline text check (length(tagline) <= 120),
  description text check (length(description) <= 600),
  photo_url text,
  phone text,
  whatsapp text,
  maps_url text,
  address text,
  opening_hours text,
  offer_text text check (length(offer_text) <= 120),
  offer_code text check (length(offer_code) <= 30),
  -- Lowercase places and/or districts, e.g. {shimla, kasauli}.
  areas text[] not null default '{}',
  active boolean not null default true,
  starts_on date not null default partner_today(),
  -- Last day covered by a payment. Null until the first one: never shown unpaid.
  paid_until date,
  monthly_fee numeric(10, 2) check (monthly_fee >= 0),
  contact_person text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists partner_properties (
  partner_id uuid not null references partners(id) on delete cascade,
  property_id text not null references properties(id) on delete cascade,
  primary key (partner_id, property_id)
);

create table if not exists partner_payments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  amount numeric(10, 2) not null check (amount >= 0),
  months integer not null check (months between 1 and 24),
  covers_from date not null,
  paid_until date not null,
  method text,
  reference text,
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists partner_events (
  id bigserial primary key,
  partner_id uuid not null references partners(id) on delete cascade,
  property_id text not null references properties(id) on delete cascade,
  reservation_id uuid,
  event text not null check (event in ('impression', 'tap', 'call', 'whatsapp', 'directions', 'code')),
  created_at timestamptz not null default now()
);
create index if not exists partner_events_partner_time on partner_events (partner_id, created_at);
create index if not exists partner_events_dedupe on partner_events (reservation_id, partner_id, event, created_at);

alter table properties
  add column if not exists partner_listings_enabled boolean not null default true,
  add column if not exists partner_blocked_categories text[] not null default '{restaurant,cafe}';

create or replace function partners_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- Areas are matched lowercase; store them that way whatever was typed.
  new.areas := (select coalesce(array_agg(distinct lower(trim(a))) filter (where trim(a) <> ''), '{}') from unnest(new.areas) a);
  return new;
end;
$$;
drop trigger if exists partners_touch on partners;
create trigger partners_touch before insert or update on partners
for each row execute function partners_touch_updated_at();

-- Platform admins (Cabadra Pulse) manage everything partner-side directly
-- under RLS; nobody else can read or write any of it. Guests and owners go
-- through the functions below.
alter table partners enable row level security;
alter table partner_properties enable row level security;
alter table partner_payments enable row level security;
alter table partner_events enable row level security;
revoke all on partners, partner_properties, partner_payments, partner_events from anon;

drop policy if exists partners_admin on partners;
create policy partners_admin on partners for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
drop policy if exists partner_properties_admin on partner_properties;
create policy partner_properties_admin on partner_properties for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
drop policy if exists partner_payments_admin_read on partner_payments;
create policy partner_payments_admin_read on partner_payments for select to authenticated using (is_platform_admin());
drop policy if exists partner_events_admin_read on partner_events;
create policy partner_events_admin_read on partner_events for select to authenticated using (is_platform_admin());

-- The partners a given property's guests may see right now.
create or replace function partners_visible_at(p_property_id text)
returns setof partners
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from partners p, properties prop
  where prop.id = p_property_id
    and prop.partner_listings_enabled
    and p.active
    and p.starts_on <= partner_today()
    and p.paid_until >= partner_today()
    and not (p.category = any (prop.partner_blocked_categories))
    and (
      exists (select 1 from partner_properties pp where pp.partner_id = p.id and pp.property_id = prop.id)
      or (
        not exists (select 1 from partner_properties pp where pp.partner_id = p.id)
        and p.areas && location_area_parts(prop.location)
      )
    );
$$;
revoke all on function partners_visible_at(text) from public, anon, authenticated;

create or replace function guest_get_partner_listings(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_location text;
  v_items jsonb;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if v_reservation.id is null then
    raise exception 'Invalid guest link';
  end if;

  select location into v_location from properties where id = v_reservation.property_id;

  -- Rotated daily so every paying partner gets turns at the front of the row.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'category', p.category, 'tagline', p.tagline,
           'description', p.description, 'photo', p.photo_url, 'phone', p.phone,
           'whatsapp', p.whatsapp, 'mapsUrl', p.maps_url, 'address', p.address,
           'openingHours', p.opening_hours, 'offerText', p.offer_text, 'offerCode', p.offer_code
         ) order by md5(p.id::text || partner_today()::text)), '[]'::jsonb)
  into v_items
  from (select * from partners_visible_at(v_reservation.property_id) limit 12) p;

  return jsonb_build_object(
    'area', initcap((location_area_parts(v_location))[1]),
    'items', v_items
  );
end;
$$;
revoke all on function guest_get_partner_listings(uuid) from public;
grant execute on function guest_get_partner_listings(uuid) to anon, authenticated;

-- What a guest did with a listing. Only partners this guest can actually
-- see are counted; an impression counts once per guest per partner per
-- day, and anything else once a minute, so a reload or a double tap
-- doesn't inflate a business's report.
create or replace function guest_log_partner_events(p_token uuid, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_event jsonb;
  v_partner uuid;
  v_kind text;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if v_reservation.id is null then
    raise exception 'Invalid guest link';
  end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 20 then
    raise exception 'Too many events';
  end if;

  for v_event in select * from jsonb_array_elements(p_events) loop
    begin
      v_partner := (v_event->>'partnerId')::uuid;
    exception when others then
      continue;
    end;
    v_kind := v_event->>'event';
    continue when v_kind is null or v_kind not in ('impression', 'tap', 'call', 'whatsapp', 'directions', 'code');
    continue when not exists (select 1 from partners_visible_at(v_reservation.property_id) p where p.id = v_partner);
    continue when exists (
      select 1 from partner_events e
      where e.reservation_id = v_reservation.id and e.partner_id = v_partner and e.event = v_kind
        and e.created_at > case when v_kind = 'impression'
                                then (partner_today()::timestamp at time zone 'Asia/Kolkata')
                                else now() - interval '1 minute' end
    );
    insert into partner_events (partner_id, property_id, reservation_id, event)
    values (v_partner, v_reservation.property_id, v_reservation.id, v_kind);
  end loop;
end;
$$;
revoke all on function guest_log_partner_events(uuid, jsonb) from public;
grant execute on function guest_log_partner_events(uuid, jsonb) to anon, authenticated;

-- Owner: switch partner listings off, or block categories, for one property.
create or replace function owner_set_partner_settings(p_property_id text, p_enabled boolean, p_blocked text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only the property owner can change this';
  end if;
  if exists (select 1 from unnest(coalesce(p_blocked, '{}')) c
             where c not in ('restaurant', 'cafe', 'taxi', 'tours', 'adventure', 'spa', 'shopping', 'other')) then
    raise exception 'Unknown category';
  end if;
  update properties
  set partner_listings_enabled = coalesce(p_enabled, true),
      partner_blocked_categories = coalesce(p_blocked, '{}')
  where id = p_property_id;
end;
$$;
revoke all on function owner_set_partner_settings(text, boolean, text[]) from public, anon;
grant execute on function owner_set_partner_settings(text, boolean, text[]) to authenticated;

create or replace function owner_get_partner_settings(p_property_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prop properties%rowtype;
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only the property owner can see this';
  end if;
  select * into v_prop from properties where id = p_property_id;
  return jsonb_build_object(
    'enabled', v_prop.partner_listings_enabled,
    'blocked', to_jsonb(v_prop.partner_blocked_categories),
    'liveCount', (select count(*) from partners_visible_at(p_property_id))
  );
end;
$$;
revoke all on function owner_get_partner_settings(text) from public, anon;
grant execute on function owner_get_partner_settings(text) to authenticated;

-- Pulse: every property (for targeting), with its area.
create or replace function admin_list_properties()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not allowed';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', p.name, 'location', p.location,
             'partnersEnabled', p.partner_listings_enabled, 'blocked', to_jsonb(p.partner_blocked_categories)
           ) order by p.name), '[]'::jsonb)
    from properties p
  );
end;
$$;
revoke all on function admin_list_properties() from public, anon;
grant execute on function admin_list_properties() to authenticated;

-- Pulse: record a month (or several) paid. Extends from the current
-- paid_until when still running, from today when lapsed.
create or replace function admin_record_partner_payment(p_partner_id uuid, p_amount numeric, p_months integer, p_method text, p_reference text)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner partners%rowtype;
  v_from date;
  v_until date;
begin
  if not is_platform_admin() then
    raise exception 'Not allowed';
  end if;
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'Months must be between 1 and 24';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Enter the amount paid';
  end if;

  select * into v_partner from partners where id = p_partner_id for update;
  if v_partner.id is null then
    raise exception 'Partner not found';
  end if;

  v_from := greatest(coalesce(v_partner.paid_until, partner_today() - 1), partner_today() - 1) + 1;
  v_until := (v_from + make_interval(months => p_months))::date - 1;

  insert into partner_payments (partner_id, amount, months, covers_from, paid_until, method, reference)
  values (p_partner_id, p_amount, p_months, v_from, v_until, nullif(trim(p_method), ''), nullif(trim(p_reference), ''));
  update partners set paid_until = v_until where id = p_partner_id;
  return v_until;
end;
$$;
revoke all on function admin_record_partner_payment(uuid, numeric, integer, text, text) from public, anon;
grant execute on function admin_record_partner_payment(uuid, numeric, integer, text, text) to authenticated;

-- Pulse: what guests did with each partner over the last p_days, per hotel.
create or replace function admin_partner_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not allowed';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'partnerId', s.partner_id, 'propertyId', s.property_id, 'propertyName', prop.name,
             'impressions', s.impressions, 'taps', s.taps, 'calls', s.calls,
             'whatsapps', s.whatsapps, 'directions', s.directions, 'codes', s.codes
           )), '[]'::jsonb)
    from (
      select partner_id, property_id,
             count(*) filter (where event = 'impression') as impressions,
             count(*) filter (where event = 'tap') as taps,
             count(*) filter (where event = 'call') as calls,
             count(*) filter (where event = 'whatsapp') as whatsapps,
             count(*) filter (where event = 'directions') as directions,
             count(*) filter (where event = 'code') as codes
      from partner_events
      where created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
      group by partner_id, property_id
    ) s
    join properties prop on prop.id = s.property_id
  );
end;
$$;
revoke all on function admin_partner_stats(integer) from public, anon;
grant execute on function admin_partner_stats(integer) to authenticated;

-- Partner photos: public to read (they're ads), only platform admins write.
insert into storage.buckets (id, name, public)
values ('partner-photos', 'partner-photos', true)
on conflict (id) do nothing;

drop policy if exists partner_photos_admin_insert on storage.objects;
create policy partner_photos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'partner-photos' and public.is_platform_admin());
drop policy if exists partner_photos_admin_update on storage.objects;
create policy partner_photos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'partner-photos' and public.is_platform_admin());
drop policy if exists partner_photos_admin_delete on storage.objects;
create policy partner_photos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'partner-photos' and public.is_platform_admin());
