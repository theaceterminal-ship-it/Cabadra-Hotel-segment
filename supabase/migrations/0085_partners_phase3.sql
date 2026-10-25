-- Partners marketplace, phase 3: partner accounts, self-editing, reception
-- concierge bookings, guest ratings and GST invoices.
--
--   * Accounts: a business signs up and signs in like an owner (Google, or
--     email + password once they've set one). partner_users links an
--     account to the businesses it runs. Applying now needs an account
--     (partner_apply); the anonymous website form (system_partner_apply,
--     0084) is gone. A business that existed before is linked the first
--     time someone signs in with its email (partner_claim).
--   * Safer links: once a business has an account, its emailed
--     /partner/:token link no longer opens anything by itself; it asks for
--     sign-in. Pulse can also issue a new link (admin_rotate_partner_link).
--   * Self-editing: changes to what guests see wait in pending_changes
--     until an admin approves them in Pulse. Contact email and billing (GST)
--     details save straight away: guests never see them. An application
--     that isn't approved yet is edited in place; a rejected one goes back
--     into review when edited.
--   * Reception concierge: front desk books a partner for an in-house guest
--     (staff_partner_request) once the guest has asked them to. It's a
--     partner_requests row with source 'reception'; the business gets it
--     exactly like a guest's own request, and the guest sees it in their
--     app.
--   * Ratings: a guest rates a business once per request, after the
--     business accepted it. The average shows on the listing from 3
--     ratings; admins can hide abusive ones.
--   * GST invoices: every partner payment above zero gets an invoice with a
--     consecutive number per financial year (CBD/2026-27/0001), a snapshot
--     of both parties and the tax split (CGST+SGST inside Himachal, IGST
--     outside). It's a tax invoice only once Cabadra's GSTIN is set in
--     Pulse; until then it's a receipt with no tax lines. Invoices are
--     never edited or deleted.
-- Apply after 0001-0084.

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table if not exists partner_users (
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, partner_id)
);
create index if not exists partner_users_partner on partner_users (partner_id);
alter table partner_users enable row level security;
revoke all on partner_users from anon;
drop policy if exists partner_users_own on partner_users;
create policy partner_users_own on partner_users for select to authenticated using (user_id = auth.uid() or is_platform_admin());

create or replace function is_partner_user(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from partner_users where user_id = auth.uid() and partner_id = p_partner_id);
$$;
revoke all on function is_partner_user(uuid) from public, anon;
grant execute on function is_partner_user(uuid) to authenticated;

-- The signed-in account's confirmed email (Google's always is).
create or replace function auth_confirmed_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null;
$$;
revoke all on function auth_confirmed_email() from public, anon, authenticated;

-- Links every business whose email is this account's (confirmed) email.
-- Returns the account's businesses.
create or replace function partner_claim()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := auth_confirmed_email();
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if v_email is not null then
    insert into partner_users (user_id, partner_id)
    select auth.uid(), p.id from partners p where lower(p.email) = v_email
    on conflict do nothing;
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'paidUntil', p.paid_until, 'photo', p.photo_url) order by p.name), '[]'::jsonb)
    from partners p join partner_users pu on pu.partner_id = p.id and pu.user_id = auth.uid()
  );
end;
$$;
revoke all on function partner_claim() from public, anon;
grant execute on function partner_claim() to authenticated;

-- For the "/" redirect: does this account run a business (and nothing else)?
create or replace function partner_is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from partner_users where user_id = auth.uid())
      or exists (select 1 from partners p where lower(p.email) = auth_confirmed_email());
$$;
revoke all on function partner_is_member() from public, anon;
grant execute on function partner_is_member() to authenticated;

create or replace function admin_rotate_partner_link(p_partner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if not is_platform_admin() then
    raise exception 'Not allowed';
  end if;
  update partners set portal_token = gen_random_uuid() where id = p_partner_id returning portal_token into v_token;
  return v_token;
end;
$$;
revoke all on function admin_rotate_partner_link(uuid) from public, anon;
grant execute on function admin_rotate_partner_link(uuid) to authenticated;

-- Which business a request is about: the signed-in account's own, or one
-- reached by its partner page link while it has no account yet.
create or replace function partner_resolve(p_token uuid, p_partner_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_partner_id is not null then
    if not is_partner_user(p_partner_id) then
      raise exception 'Sign in with the account that runs this business';
    end if;
    return p_partner_id;
  end if;
  select id into v_id from partners where portal_token = p_token;
  if v_id is null then
    raise exception 'This partner link isn’t valid';
  end if;
  if exists (select 1 from partner_users where partner_id = v_id) then
    raise exception 'SIGN_IN_REQUIRED: This business has an account now. Sign in to open its partner page.';
  end if;
  return v_id;
end;
$$;
revoke all on function partner_resolve(uuid, uuid) from public;
grant execute on function partner_resolve(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Listing fields: one validator for applying and for edits
-- ---------------------------------------------------------------------------
alter table partners
  add column if not exists pending_changes jsonb,
  add column if not exists changes_submitted_at timestamptz,
  add column if not exists changes_reviewed_at timestamptz,
  add column if not exists changes_note text,
  add column if not exists legal_name text,
  add column if not exists gstin text,
  add column if not exists billing_address text,
  add column if not exists state_code text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partners_gstin_format') then
    alter table partners add constraint partners_gstin_format check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partners_state_code_format') then
    alter table partners add constraint partners_state_code_format check (state_code is null or state_code ~ '^[0-9]{2}$');
  end if;
end $$;

-- Checks and tidies what a business wrote about itself; raises a reason a
-- business can act on. Returns the listing fields, normalised.
create or replace function partner_listing_fields(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_areas text[];
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g');
  t text;
begin
  if length(trim(coalesce(p->>'name', ''))) < 2 then
    raise exception 'Enter your business name';
  end if;
  if coalesce(p->>'category', '') not in ('restaurant', 'cafe', 'taxi', 'tours', 'adventure', 'spa', 'shopping', 'other') then
    raise exception 'Pick what kind of business it is';
  end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 10 then
    raise exception 'Enter a phone number guests can call';
  end if;
  select coalesce(array_agg(distinct lower(trim(a))) filter (where trim(a) <> ''), '{}') into v_areas
  from jsonb_array_elements_text(coalesce(p->'areas', '[]'::jsonb)) a;
  if cardinality(v_areas) = 0 then
    raise exception 'Pick at least one area you serve';
  end if;
  if cardinality(v_areas) > 8 then
    raise exception 'Pick up to 8 areas';
  end if;
  t := nullif(upper(regexp_replace(coalesce(p->>'offerCode', ''), '\s', '', 'g')), '');
  return jsonb_build_object(
    'name', left(trim(p->>'name'), 80),
    'category', p->>'category',
    'tagline', nullif(left(trim(coalesce(p->>'tagline', '')), 120), ''),
    'description', nullif(left(trim(coalesce(p->>'description', '')), 600), ''),
    'photo', case when p->>'photo' ~ '^https://' then p->>'photo' end,
    'phone', v_phone,
    'whatsapp', nullif(regexp_replace(coalesce(p->>'whatsapp', ''), '[^0-9+]', '', 'g'), ''),
    'mapsUrl', case when p->>'mapsUrl' ~ '^https://' then left(p->>'mapsUrl', 500) end,
    'address', nullif(left(trim(coalesce(p->>'address', '')), 200), ''),
    'openingHours', nullif(left(trim(coalesce(p->>'openingHours', '')), 80), ''),
    'offerText', nullif(left(trim(coalesce(p->>'offerText', '')), 120), ''),
    'offerCode', left(t, 30),
    'areas', to_jsonb(v_areas)
  );
end;
$$;
revoke all on function partner_listing_fields(jsonb) from public, anon, authenticated;

create or replace function partner_write_listing(p_partner_id uuid, f jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update partners set
    name = f->>'name', category = f->>'category', tagline = f->>'tagline', description = f->>'description',
    photo_url = f->>'photo', phone = f->>'phone', whatsapp = f->>'whatsapp', maps_url = f->>'mapsUrl',
    address = f->>'address', opening_hours = f->>'openingHours', offer_text = f->>'offerText', offer_code = f->>'offerCode',
    areas = array(select jsonb_array_elements_text(f->'areas'))
  where id = p_partner_id;
$$;
revoke all on function partner_write_listing(uuid, jsonb) from public, anon, authenticated;

create or replace function partner_listing_json(p partners)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'name', p.name, 'category', p.category, 'tagline', p.tagline, 'description', p.description, 'photo', p.photo_url,
    'phone', p.phone, 'whatsapp', p.whatsapp, 'mapsUrl', p.maps_url, 'address', p.address, 'openingHours', p.opening_hours,
    'offerText', p.offer_text, 'offerCode', p.offer_code, 'areas', to_jsonb(p.areas)
  );
$$;

-- A signed-in account applies for a (new) business. Pending until approved.
create or replace function partner_apply(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f jsonb;
  v_email text := lower(trim(coalesce(nullif(p->>'email', ''), auth_confirmed_email())));
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if (select count(*) from partners x join partner_users pu on pu.partner_id = x.id and pu.user_id = auth.uid() where x.status = 'pending') >= 3 then
    raise exception 'You already have applications waiting. We’ll be in touch soon.';
  end if;
  if (select count(*) from partner_users where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'That’s a lot of businesses for one day. Write to us if you need more.';
  end if;
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter an email we can reach you on';
  end if;
  f := partner_listing_fields(p);

  insert into partners (name, category, areas, active, status, source, email, owner_name, contact_person, applied_at)
  values (f->>'name', f->>'category', array(select jsonb_array_elements_text(f->'areas')), true, 'pending', 'self', v_email,
          nullif(left(trim(coalesce(p->>'ownerName', '')), 80), ''), nullif(left(trim(coalesce(p->>'ownerName', '')), 80), ''), now())
  returning id into v_id;
  perform partner_write_listing(v_id, f);
  insert into partner_users (user_id, partner_id) values (auth.uid(), v_id);
  return jsonb_build_object('id', v_id);
end;
$$;
revoke all on function partner_apply(jsonb) from public, anon;
grant execute on function partner_apply(jsonb) to authenticated;

-- The anonymous form is gone: applying needs an account now.
drop function if exists system_partner_apply(jsonb, text);

-- A business edits its listing. Waits for review once approved.
create or replace function partner_submit_changes(p_partner_id uuid, p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p partners%rowtype;
  f jsonb;
begin
  if not is_partner_user(p_partner_id) then
    raise exception 'Sign in with the account that runs this business';
  end if;
  select * into v_p from partners where id = p_partner_id for update;
  f := partner_listing_fields(p);
  if v_p.status = 'approved' then
    if f = partner_listing_json(v_p) then
      update partners set pending_changes = null, changes_submitted_at = null where id = p_partner_id;
      return 'unchanged';
    end if;
    update partners set pending_changes = f, changes_submitted_at = now(), changes_note = null where id = p_partner_id;
    return 'in_review';
  end if;
  perform partner_write_listing(p_partner_id, f);
  if v_p.status = 'rejected' then
    update partners set status = 'pending', applied_at = now(), review_note = null, reviewed_at = null where id = p_partner_id;
  end if;
  return 'saved';
end;
$$;
revoke all on function partner_submit_changes(uuid, jsonb) from public, anon;
grant execute on function partner_submit_changes(uuid, jsonb) to authenticated;

create or replace function partner_withdraw_changes(p_partner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_partner_user(p_partner_id) then
    raise exception 'Sign in with the account that runs this business';
  end if;
  update partners set pending_changes = null, changes_submitted_at = null where id = p_partner_id;
end;
$$;
revoke all on function partner_withdraw_changes(uuid) from public, anon;
grant execute on function partner_withdraw_changes(uuid) to authenticated;

-- Contact email and billing details: private, so saved straight away.
create or replace function partner_save_details(p_partner_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p->>'email', '')));
  v_gstin text := nullif(upper(regexp_replace(coalesce(p->>'gstin', ''), '\s', '', 'g')), '');
  v_state text := nullif(trim(coalesce(p->>'stateCode', '')), '');
begin
  if not is_partner_user(p_partner_id) then
    raise exception 'Sign in with the account that runs this business';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter an email we can reach you on';
  end if;
  if v_gstin is not null and v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That GSTIN doesn’t look right. It’s 15 characters, like 02ABCDE1234F1Z5.';
  end if;
  if v_state is not null and v_state !~ '^[0-9]{2}$' then
    raise exception 'Pick your state';
  end if;
  update partners set
    email = v_email,
    owner_name = nullif(left(trim(coalesce(p->>'ownerName', '')), 80), ''),
    legal_name = nullif(left(trim(coalesce(p->>'legalName', '')), 120), ''),
    gstin = v_gstin,
    billing_address = nullif(left(trim(coalesce(p->>'billingAddress', '')), 300), ''),
    state_code = coalesce(left(v_gstin, 2), v_state)
  where id = p_partner_id;
end;
$$;
revoke all on function partner_save_details(uuid, jsonb) from public, anon;
grant execute on function partner_save_details(uuid, jsonb) to authenticated;

create or replace function admin_review_changes(p_partner_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p partners%rowtype;
begin
  if not is_platform_admin() then
    raise exception 'Not allowed';
  end if;
  select * into v_p from partners where id = p_partner_id for update;
  if v_p.pending_changes is null then
    raise exception 'No changes waiting';
  end if;
  if p_approve then
    perform partner_write_listing(p_partner_id, v_p.pending_changes);
  end if;
  update partners set pending_changes = null, changes_reviewed_at = now(),
    changes_note = case when p_approve then null else nullif(trim(p_note), '') end
  where id = p_partner_id;
end;
$$;
revoke all on function admin_review_changes(uuid, boolean, text) from public, anon;
grant execute on function admin_review_changes(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Requests: from reception too
-- ---------------------------------------------------------------------------
alter table partner_requests
  add column if not exists source text not null default 'guest',
  add column if not exists created_by uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partner_requests_source_check') then
    alter table partner_requests add constraint partner_requests_source_check check (source in ('guest', 'reception'));
  end if;
end $$;

create or replace function staff_partner_request(p_reservation_id uuid, p_partner_id uuid, p_message text, p_preferred_time text, p_party_size integer, p_phone text, p_guest_agreed boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_guest guests%rowtype;
  v_phone text;
  v_id uuid;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if v_res.id is null or not is_staff_for_property(v_res.property_id) then
    raise exception 'Stay not found';
  end if;
  if v_res.status not in ('checked_in', 'upcoming') then
    raise exception 'Only for guests staying now or arriving';
  end if;
  if not coalesce(p_guest_agreed, false) then
    raise exception 'Confirm the guest asked you to book this and is happy to share their name and phone';
  end if;
  if length(trim(coalesce(p_message, ''))) < 2 then
    raise exception 'Write what the guest wants';
  end if;
  if not exists (select 1 from partners_visible_at(v_res.property_id) p where p.id = p_partner_id and p.email is not null) then
    raise exception 'This business isn’t taking requests here right now';
  end if;
  select * into v_guest from guests where id = v_res.guest_id;
  v_phone := coalesce(nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), ''), v_guest.phone);
  if v_phone is null or length(regexp_replace(v_phone, '\D', '', 'g')) < 10 then
    raise exception 'Add the guest’s phone number so the business can reach them';
  end if;
  insert into partner_requests (partner_id, property_id, reservation_id, guest_name, guest_phone, hotel_name, room_number, message, preferred_time, party_size, source, created_by)
  values (p_partner_id, v_res.property_id, v_res.id, coalesce(v_guest.name, 'Guest'), v_phone,
          (select name from properties where id = v_res.property_id), (select number from rooms where id = v_res.room_id),
          left(trim(p_message), 500), nullif(left(trim(coalesce(p_preferred_time, '')), 80), ''), p_party_size, 'reception', auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;
revoke all on function staff_partner_request(uuid, uuid, text, text, integer, text, boolean) from public, anon;
grant execute on function staff_partner_request(uuid, uuid, text, text, integer, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Ratings
-- ---------------------------------------------------------------------------
create table if not exists partner_ratings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references partner_requests(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  property_id text not null references properties(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text check (length(comment) <= 300),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists partner_ratings_partner on partner_ratings (partner_id, created_at desc);
alter table partner_ratings enable row level security;
revoke all on partner_ratings from anon;
drop policy if exists partner_ratings_admin on partner_ratings;
create policy partner_ratings_admin on partner_ratings for select to authenticated using (is_platform_admin());

create or replace function partner_rating_summary(p_partner_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('average', round(avg(stars)::numeric, 1), 'count', count(*))
  from partner_ratings where partner_id = p_partner_id and not hidden;
$$;
revoke all on function partner_rating_summary(uuid) from public, anon, authenticated;

create or replace function guest_rate_partner(p_token uuid, p_request_id uuid, p_stars integer, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_req partner_requests%rowtype;
begin
  select * into v_res from reservations where guest_token = p_token;
  if v_res.id is null then
    raise exception 'Invalid guest link';
  end if;
  select * into v_req from partner_requests where id = p_request_id and reservation_id = v_res.id;
  if v_req.id is null then
    raise exception 'Request not found';
  end if;
  if v_req.status not in ('accepted', 'done') then
    raise exception 'You can rate them once they’ve taken your request';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Pick 1 to 5 stars';
  end if;
  insert into partner_ratings (request_id, partner_id, property_id, stars, comment)
  values (v_req.id, v_req.partner_id, v_req.property_id, p_stars, nullif(left(trim(coalesce(p_comment, '')), 300), ''))
  on conflict (request_id) do nothing;
  if not found then
    raise exception 'You’ve already rated this one';
  end if;
end;
$$;
revoke all on function guest_rate_partner(uuid, uuid, integer, text) from public;
grant execute on function guest_rate_partner(uuid, uuid, integer, text) to anon, authenticated;

create or replace function admin_hide_rating(p_rating_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not allowed';
  end if;
  update partner_ratings set hidden = p_hidden where id = p_rating_id;
end;
$$;
revoke all on function admin_hide_rating(uuid, boolean) from public, anon;
grant execute on function admin_hide_rating(uuid, boolean) to authenticated;

-- The guest's requests, now with who made them and their rating.
create or replace function guest_partner_requests(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
begin
  select * into v_res from reservations where guest_token = p_token;
  if v_res.id is null then
    raise exception 'Invalid guest link';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'partnerId', r.partner_id, 'partnerName', p.name, 'message', r.message,
      'preferredTime', r.preferred_time, 'status', r.status, 'businessNote', r.business_note, 'createdAt', r.created_at,
      'source', r.source, 'rating', rt.stars
    ) order by r.created_at desc), '[]'::jsonb)
    from partner_requests r
    join partners p on p.id = r.partner_id
    left join partner_ratings rt on rt.request_id = r.id
    where r.reservation_id = v_res.id
  );
end;
$$;

-- Listings, with the rating once there are at least 3.
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

  -- Featured ones first, then rotated daily so every paying partner gets turns at the front.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'category', p.category, 'tagline', p.tagline,
           'description', p.description, 'photo', p.photo_url, 'phone', p.phone,
           'whatsapp', p.whatsapp, 'mapsUrl', p.maps_url, 'address', p.address,
           'openingHours', p.opening_hours, 'offerText', p.offer_text, 'offerCode', p.offer_code,
           'featured', p.featured,
           'takesRequests', p.email is not null,
           'rating', case when (p.rating->>'count')::int >= 3 then (p.rating->>'average')::numeric end,
           'ratingCount', (p.rating->>'count')::int
         ) order by p.featured desc, p.turn), '[]'::jsonb)
  into v_items
  from (
    select v.*, coalesce(v.featured_until >= partner_today(), false) as featured, md5(v.id::text || partner_today()::text) as turn,
           partner_rating_summary(v.id) as rating
    from partners_visible_at(v_reservation.property_id) v
    order by featured desc, turn
    limit 12
  ) p;

  return jsonb_build_object('area', initcap((location_area_parts(v_location))[1]), 'items', v_items);
end;
$$;

-- ---------------------------------------------------------------------------
-- GST invoices
-- ---------------------------------------------------------------------------
alter table partner_settings
  add column if not exists seller_legal_name text not null default 'Churmuri',
  add column if not exists seller_address text not null default 'Solan, Himachal Pradesh, India',
  add column if not exists seller_gstin text,
  add column if not exists seller_state_code text not null default '02',
  add column if not exists sac_code text not null default '998366',
  add column if not exists gst_rate numeric(5, 2) not null default 18,
  add column if not exists prices_include_gst boolean not null default true;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partner_settings_seller_gstin_format') then
    alter table partner_settings add constraint partner_settings_seller_gstin_format check (seller_gstin is null or seller_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
  end if;
end $$;

-- Pricing for the website now says whether GST is on top.
create or replace function public_partner_pricing()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('listingFeeMonthly', listing_fee_monthly, 'featuredFeeMonthly', featured_fee_monthly, 'currency', 'INR',
                            'gstExtra', seller_gstin is not null and not prices_include_gst, 'gstRate', gst_rate)
  from partner_settings where id = 1;
$$;

create table if not exists partner_invoice_counters (
  fy text primary key,
  last_seq integer not null default 0
);
alter table partner_invoice_counters enable row level security;
revoke all on partner_invoice_counters from anon, authenticated;

create table if not exists partner_invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  fy text not null,
  seq integer not null,
  payment_id uuid not null unique references partner_payments(id),
  partner_id uuid not null references partners(id),
  issued_on date not null,
  tax_invoice boolean not null,
  description text not null,
  sac_code text not null,
  gst_rate numeric(5, 2) not null,
  taxable numeric(10, 2) not null,
  cgst numeric(10, 2) not null default 0,
  sgst numeric(10, 2) not null default 0,
  igst numeric(10, 2) not null default 0,
  total numeric(10, 2) not null,
  seller jsonb not null,
  buyer jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists partner_invoices_partner on partner_invoices (partner_id, issued_on desc);
alter table partner_invoices enable row level security;
revoke all on partner_invoices from anon;
drop policy if exists partner_invoices_admin_read on partner_invoices;
create policy partner_invoices_admin_read on partner_invoices for select to authenticated using (is_platform_admin());

-- Invoices are records: never changed or removed.
create or replace function partner_invoices_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Invoices can’t be changed or deleted';
end;
$$;
drop trigger if exists partner_invoices_immutable on partner_invoices;
create trigger partner_invoices_immutable before update or delete on partner_invoices
for each row execute function partner_invoices_immutable();

-- India's financial year for a date: 2026-04-01..2027-03-31 is "2026-27".
create or replace function financial_year(d date)
returns text
language sql
immutable
as $$
  select case when extract(month from d) >= 4
    then extract(year from d)::int || '-' || lpad(((extract(year from d)::int + 1) % 100)::text, 2, '0')
    else (extract(year from d)::int - 1) || '-' || lpad((extract(year from d)::int % 100)::text, 2, '0') end;
$$;

create or replace function issue_partner_invoice(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay partner_payments%rowtype;
  v_p partners%rowtype;
  v_s partner_settings%rowtype;
  v_issued date;
  v_fy text;
  v_seq integer;
  v_tax boolean;
  v_taxable numeric;
  v_gst numeric;
  v_buyer_state text;
  v_cgst numeric := 0;
  v_sgst numeric := 0;
  v_igst numeric := 0;
  v_id uuid;
begin
  select id into v_id from partner_invoices where payment_id = p_payment_id;
  if v_id is not null then
    return v_id;
  end if;
  select * into v_pay from partner_payments where id = p_payment_id;
  if v_pay.id is null or v_pay.amount <= 0 then
    return null;
  end if;
  select * into v_p from partners where id = v_pay.partner_id;
  select * into v_s from partner_settings where id = 1;
  v_issued := (v_pay.created_at at time zone 'Asia/Kolkata')::date;
  v_fy := financial_year(v_issued);
  insert into partner_invoice_counters (fy, last_seq) values (v_fy, 1)
  on conflict (fy) do update set last_seq = partner_invoice_counters.last_seq + 1
  returning last_seq into v_seq;

  v_tax := v_s.seller_gstin is not null;
  if v_tax then
    -- The amount received always includes the tax (checkout adds it on when prices are before GST).
    v_taxable := round(v_pay.amount / (1 + v_s.gst_rate / 100), 2);
    v_gst := v_pay.amount - v_taxable;
    v_buyer_state := coalesce(left(v_p.gstin, 2), v_p.state_code, v_s.seller_state_code);
    if v_buyer_state = v_s.seller_state_code then
      v_cgst := round(v_gst / 2, 2);
      v_sgst := v_gst - v_cgst;
    else
      v_igst := v_gst;
    end if;
  else
    v_taxable := v_pay.amount;
  end if;

  insert into partner_invoices (number, fy, seq, payment_id, partner_id, issued_on, tax_invoice, description, sac_code, gst_rate,
                                taxable, cgst, sgst, igst, total, seller, buyer)
  values (
    'CBD/' || v_fy || '/' || lpad(v_seq::text, 4, '0'), v_fy, v_seq, v_pay.id, v_p.id, v_issued, v_tax,
    case v_pay.kind when 'featured' then 'Featured placement' else 'Listing' end || ' in the Cabadra guest app, '
      || v_pay.months || ' month' || case when v_pay.months = 1 then '' else 's' end
      || ' (' || to_char(v_pay.covers_from, 'DD Mon YYYY') || ' to ' || to_char(v_pay.paid_until, 'DD Mon YYYY') || ')',
    v_s.sac_code, case when v_tax then v_s.gst_rate else 0 end,
    v_taxable, v_cgst, v_sgst, v_igst, v_pay.amount,
    jsonb_build_object('name', v_s.seller_legal_name, 'address', v_s.seller_address, 'gstin', v_s.seller_gstin, 'stateCode', v_s.seller_state_code),
    jsonb_build_object('name', coalesce(v_p.legal_name, v_p.name), 'tradeName', v_p.name, 'address', coalesce(v_p.billing_address, v_p.address),
                       'gstin', v_p.gstin, 'stateCode', coalesce(left(v_p.gstin, 2), v_p.state_code), 'email', v_p.email,
                       'payment', case when v_pay.source = 'online' then 'Razorpay ' || coalesce(v_pay.razorpay_payment_id, '') else coalesce(v_pay.method, 'Manual') end)
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function issue_partner_invoice(uuid) from public, anon, authenticated;

create or replace function partner_payments_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform issue_partner_invoice(new.id);
  return new;
end;
$$;
drop trigger if exists partner_payments_invoice on partner_payments;
create trigger partner_payments_invoice after insert on partner_payments
for each row execute function partner_payments_invoice();

-- Payments made before invoices existed get theirs, in order.
do $$
declare
  r record;
begin
  for r in select id from partner_payments p where amount > 0 and not exists (select 1 from partner_invoices i where i.payment_id = p.id) order by created_at loop
    perform issue_partner_invoice(r.id);
  end loop;
end $$;

-- Checkout adds GST on top only when prices are set before tax.
drop function if exists system_create_partner_order(uuid, text, integer);
create or replace function system_create_partner_order(p_partner_id uuid, p_kind text, p_months integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p partners%rowtype;
  v_s partner_settings%rowtype;
  v_fee numeric;
  v_amount numeric;
  v_order partner_orders%rowtype;
begin
  select * into v_p from partners where id = p_partner_id;
  if v_p.id is null then
    raise exception 'Partner not found';
  end if;
  if v_p.status <> 'approved' then
    raise exception 'Your listing hasn’t been approved yet';
  end if;
  if p_months not in (1, 3, 6, 12) then
    raise exception 'Pick 1, 3, 6 or 12 months';
  end if;
  if p_kind = 'featured' and coalesce(v_p.paid_until, partner_today() - 1) < partner_today() then
    raise exception 'Pay for the listing first, then add a featured spot';
  end if;
  if (select count(*) from partner_orders where partner_id = v_p.id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many attempts. Try again in an hour.';
  end if;
  select * into v_s from partner_settings where id = 1;
  v_fee := case p_kind when 'listing' then v_s.listing_fee_monthly when 'featured' then v_s.featured_fee_monthly end;
  if v_fee is null then
    raise exception 'Unknown payment kind';
  end if;
  v_amount := v_fee * p_months;
  if v_s.seller_gstin is not null and not v_s.prices_include_gst then
    v_amount := v_amount * (1 + v_s.gst_rate / 100);
  end if;
  if v_amount < 1 then
    raise exception 'Nothing to pay';
  end if;
  insert into partner_orders (partner_id, kind, months, amount_paise)
  values (v_p.id, p_kind, p_months, round(v_amount * 100)::integer)
  returning * into v_order;
  return jsonb_build_object('orderId', v_order.id, 'amountPaise', v_order.amount_paise, 'partnerName', v_p.name, 'email', v_p.email, 'phone', v_p.phone);
end;
$$;
revoke all on function system_create_partner_order(uuid, text, integer) from public, anon, authenticated;
grant execute on function system_create_partner_order(uuid, text, integer) to service_role;

create or replace function admin_save_billing_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gstin text := nullif(upper(regexp_replace(coalesce(p->>'gstin', ''), '\s', '', 'g')), '');
begin
  if not is_platform_admin() then
    raise exception 'Not allowed';
  end if;
  if v_gstin is not null and v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That GSTIN doesn’t look right';
  end if;
  if coalesce((p->>'gstRate')::numeric, 18) not between 0 and 28 then
    raise exception 'GST rate must be between 0 and 28%%';
  end if;
  update partner_settings set
    seller_legal_name = coalesce(nullif(trim(p->>'legalName'), ''), seller_legal_name),
    seller_address = coalesce(nullif(trim(p->>'address'), ''), seller_address),
    seller_gstin = v_gstin,
    seller_state_code = coalesce(left(v_gstin, 2), nullif(trim(p->>'stateCode'), ''), seller_state_code),
    sac_code = coalesce(nullif(trim(p->>'sacCode'), ''), sac_code),
    gst_rate = coalesce((p->>'gstRate')::numeric, gst_rate),
    prices_include_gst = coalesce((p->>'pricesIncludeGst')::boolean, prices_include_gst),
    updated_at = now()
  where id = 1;
end;
$$;
revoke all on function admin_save_billing_settings(jsonb) from public, anon;
grant execute on function admin_save_billing_settings(jsonb) to authenticated;

-- One invoice, for the business that paid it (signed in, or by its link
-- while it has no account) or an admin.
create or replace function partner_invoice_get(p_invoice_id uuid, p_token uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inv partner_invoices%rowtype;
begin
  select * into v_inv from partner_invoices where id = p_invoice_id;
  if v_inv.id is null then
    raise exception 'Invoice not found';
  end if;
  if not (is_platform_admin() or is_partner_user(v_inv.partner_id)
          or (p_token is not null and exists (select 1 from partners where id = v_inv.partner_id and portal_token = p_token)
              and not exists (select 1 from partner_users where partner_id = v_inv.partner_id))) then
    raise exception 'Invoice not found';
  end if;
  return to_jsonb(v_inv) - 'payment_id';
end;
$$;
revoke all on function partner_invoice_get(uuid, uuid) from public;
grant execute on function partner_invoice_get(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The partner page: by account or by link
-- ---------------------------------------------------------------------------
create or replace function partner_portal_json(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p partners%rowtype;
begin
  select * into v_p from partners where id = p_partner_id;
  return jsonb_build_object(
    'partner', jsonb_build_object(
      'id', v_p.id, 'name', v_p.name, 'category', v_p.category, 'tagline', v_p.tagline, 'description', v_p.description,
      'photo', v_p.photo_url, 'phone', v_p.phone, 'whatsapp', v_p.whatsapp, 'email', v_p.email, 'ownerName', v_p.owner_name,
      'mapsUrl', v_p.maps_url, 'address', v_p.address, 'openingHours', v_p.opening_hours, 'offerText', v_p.offer_text, 'offerCode', v_p.offer_code,
      'areas', to_jsonb(v_p.areas), 'status', v_p.status, 'reviewNote', v_p.review_note, 'active', v_p.active,
      'paidUntil', v_p.paid_until, 'featuredUntil', v_p.featured_until, 'appliedAt', v_p.applied_at,
      'pendingChanges', v_p.pending_changes, 'changesSubmittedAt', v_p.changes_submitted_at, 'changesNote', v_p.changes_note,
      'legalName', v_p.legal_name, 'gstin', v_p.gstin, 'billingAddress', v_p.billing_address, 'stateCode', v_p.state_code,
      'hasAccount', exists (select 1 from partner_users where partner_id = v_p.id)
    ),
    'today', partner_today(),
    'pricing', public_partner_pricing(),
    'reach', (select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'location', r.location) order by r.name), '[]'::jsonb) from partner_reach(v_p.id) r),
    'stats30', (
      select jsonb_build_object(
        'views', count(*) filter (where event = 'impression'),
        'opens', count(*) filter (where event = 'tap'),
        'contacts', count(*) filter (where event in ('call', 'whatsapp', 'directions', 'code'))
      )
      from partner_events where partner_id = v_p.id and created_at > now() - interval '30 days'
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object('kind', pay.kind, 'amount', pay.amount, 'months', pay.months, 'coversFrom', pay.covers_from,
        'paidUntil', pay.paid_until, 'source', pay.source, 'createdAt', pay.created_at, 'invoiceId', i.id, 'invoiceNumber', i.number) order by pay.created_at desc), '[]'::jsonb)
      from partner_payments pay left join partner_invoices i on i.payment_id = pay.id
      where pay.partner_id = v_p.id
    ),
    'requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'guestName', r.guest_name, 'guestPhone', r.guest_phone, 'hotelName', r.hotel_name, 'roomNumber', r.room_number,
        'message', r.message, 'preferredTime', r.preferred_time, 'partySize', r.party_size, 'status', r.status,
        'businessNote', r.business_note, 'createdAt', r.created_at, 'source', r.source, 'rating', rt.stars
      ) order by r.created_at desc), '[]'::jsonb)
      from (select * from partner_requests where partner_id = v_p.id order by created_at desc limit 100) r
      left join partner_ratings rt on rt.request_id = r.id
    ),
    'rating', partner_rating_summary(v_p.id),
    'ratings', (
      select coalesce(jsonb_agg(jsonb_build_object('stars', stars, 'comment', comment, 'createdAt', created_at) order by created_at desc), '[]'::jsonb)
      from (select * from partner_ratings where partner_id = v_p.id and not hidden order by created_at desc limit 20) x
    )
  );
end;
$$;
revoke all on function partner_portal_json(uuid) from public, anon, authenticated;

create or replace function partner_portal_get(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return partner_portal_json(partner_resolve(p_token, null));
end;
$$;

create or replace function partner_page_get(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return partner_portal_json(partner_resolve(null, p_partner_id));
end;
$$;
revoke all on function partner_page_get(uuid) from public, anon;
grant execute on function partner_page_get(uuid) to authenticated;

-- Accept / decline / done, by link (no account yet) or signed in.
drop function if exists partner_portal_update_request(uuid, uuid, text, text);
create or replace function partner_update_request(p_token uuid, p_partner_id uuid, p_request_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := partner_resolve(p_token, p_partner_id);
begin
  if p_status not in ('accepted', 'declined', 'done') then
    raise exception 'Unknown status';
  end if;
  update partner_requests
  set status = p_status, business_note = coalesce(nullif(trim(p_note), ''), business_note), updated_at = now()
  where id = p_request_id and partner_id = v_id;
  if not found then
    raise exception 'Request not found';
  end if;
end;
$$;
revoke all on function partner_update_request(uuid, uuid, uuid, text, text) from public;
grant execute on function partner_update_request(uuid, uuid, uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reception: the concierge screen
-- ---------------------------------------------------------------------------
create or replace function staff_concierge_get(p_property_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not allowed';
  end if;
  return jsonb_build_object(
    'stays', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'reservationId', r.id, 'guestName', g.name, 'roomNumber', rm.number, 'status', r.status, 'hasPhone', g.phone is not null,
        'checkOut', r.check_out
      ) order by rm.number), '[]'::jsonb)
      from reservations r join guests g on g.id = r.guest_id left join rooms rm on rm.id = r.room_id
      where r.property_id = p_property_id
        and (r.status = 'checked_in' or (r.status = 'upcoming' and (r.check_in at time zone 'Asia/Kolkata')::date <= partner_today()))
    ),
    'partners', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'category', p.category, 'tagline', p.tagline, 'photo', p.photo_url, 'phone', p.phone,
        'whatsapp', p.whatsapp, 'offerText', p.offer_text, 'openingHours', p.opening_hours, 'takesRequests', p.email is not null,
        'featured', coalesce(p.featured_until >= partner_today(), false), 'rating', partner_rating_summary(p.id)
      ) order by coalesce(p.featured_until >= partner_today(), false) desc, p.name), '[]'::jsonb)
      from partners_visible_at(p_property_id) p
    ),
    'requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'partnerName', p.name, 'guestName', r.guest_name, 'roomNumber', r.room_number, 'message', r.message,
        'preferredTime', r.preferred_time, 'partySize', r.party_size, 'status', r.status, 'businessNote', r.business_note,
        'source', r.source, 'createdAt', r.created_at
      ) order by r.created_at desc), '[]'::jsonb)
      from partner_requests r join partners p on p.id = r.partner_id
      where r.property_id = p_property_id and r.created_at > now() - interval '14 days'
    )
  );
end;
$$;
revoke all on function staff_concierge_get(text) from public, anon;
grant execute on function staff_concierge_get(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Emails: application received, edits reviewed
-- ---------------------------------------------------------------------------
create or replace function partner_mailer_call(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from vault.decrypted_secrets where name = 'project_url') then
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/partner-mailer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'id_document_purge_cron_secret')
      ),
      body := p_body,
      timeout_milliseconds := 20000
    );
  end if;
end;
$$;
revoke all on function partner_mailer_call(jsonb) from public, anon, authenticated;

create or replace function partners_applied_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'self' and new.email is not null then
    perform partner_mailer_call(jsonb_build_object('job', 'applied', 'partnerId', new.id));
  end if;
  return new;
end;
$$;
drop trigger if exists partners_applied_notify on partners;
create trigger partners_applied_notify after insert on partners
for each row execute function partners_applied_notify();

create or replace function partners_changes_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.changes_reviewed_at is distinct from old.changes_reviewed_at and new.email is not null then
    perform partner_mailer_call(jsonb_build_object('job', 'changes', 'partnerId', new.id));
  end if;
  return new;
end;
$$;
drop trigger if exists partners_changes_notify on partners;
create trigger partners_changes_notify after update of changes_reviewed_at on partners
for each row execute function partners_changes_notify();

-- The monthly report now carries the rating.
create or replace function system_partner_month(p_partner_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'views', count(*) filter (where e.event = 'impression'),
    'opens', count(*) filter (where e.event = 'tap'),
    'calls', count(*) filter (where e.event = 'call'),
    'whatsapps', count(*) filter (where e.event = 'whatsapp'),
    'directions', count(*) filter (where e.event = 'directions'),
    'codes', count(*) filter (where e.event = 'code'),
    'requests', (select count(*) from partner_requests r where r.partner_id = p_partner_id and (r.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'hotels', (select count(distinct e2.property_id) from partner_events e2 where e2.partner_id = p_partner_id and (e2.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'rating', partner_rating_summary(p_partner_id)
  )
  from partner_events e
  where e.partner_id = p_partner_id and (e.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to;
$$;
