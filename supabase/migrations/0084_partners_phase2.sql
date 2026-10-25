-- Partners marketplace, phase 2: businesses sign themselves up and pay
-- online, get monthly reports and renewal reminders, can buy a featured
-- spot, and receive guests' booking requests; hotels can earn a commission.
--
--   * Self sign-up (website /partners, partner-signup Edge Function): a
--     business applies; it's a partners row with status 'pending' and
--     source 'self'. Nothing shows to guests until a platform admin
--     approves it in Cabadra Pulse AND it's paid (0078's rules, plus
--     status = 'approved'). Rows made in Pulse are 'approved' from the start.
--   * Each business has a private partner page (/partner/:portal_token):
--     its status, payments (Razorpay, partner-create-order and
--     partner-verify-payment), its numbers, and guests' requests.
--   * Fees live in partner_settings (one row), edited in Pulse.
--   * Featured: a paid add-on (featured_until) that puts a listing first in
--     the row. It only counts while the listing itself is paid.
--   * Hotel commission: off unless an admin turns it on in Pulse. When on,
--     each payment is shared out to the hotels the listing reaches that
--     have a commission % set: each gets its % of an equal share of the
--     payment. Every share is a partner_commissions row (never edited);
--     payouts to hotels are recorded as commission_payouts; owed is the
--     difference. Owners see what they've earned in their Local partners
--     panel.
--   * Guest booking requests (partner_requests): the guest writes what they
--     want and, only with their explicit consent, shares their name, phone
--     and hotel with that business. The business sees requests on its
--     partner page and by email, and replies on WhatsApp or by phone.
--   * partner_email_log: one row per email sent, so the daily mailer never
--     sends the same reminder twice.
-- Apply after 0001-0083.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table if not exists partner_settings (
  id integer primary key default 1 check (id = 1),
  listing_fee_monthly numeric(10, 2) not null default 1999 check (listing_fee_monthly >= 0),
  featured_fee_monthly numeric(10, 2) not null default 999 check (featured_fee_monthly >= 0),
  commission_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into partner_settings (id) values (1) on conflict (id) do nothing;
alter table partner_settings enable row level security;
revoke all on partner_settings from anon;
drop policy if exists partner_settings_admin on partner_settings;
create policy partner_settings_admin on partner_settings for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

-- What the website shows a business before it applies.
create or replace function public_partner_pricing()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('listingFeeMonthly', listing_fee_monthly, 'featuredFeeMonthly', featured_fee_monthly, 'currency', 'INR')
  from partner_settings where id = 1;
$$;
revoke all on function public_partner_pricing() from public;
grant execute on function public_partner_pricing() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Partners: applications, partner page, featured
-- ---------------------------------------------------------------------------
alter table partners
  add column if not exists status text not null default 'approved',
  add column if not exists source text not null default 'admin',
  add column if not exists email text,
  add column if not exists owner_name text,
  add column if not exists portal_token uuid not null default gen_random_uuid(),
  add column if not exists featured_until date,
  add column if not exists applied_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partners_status_check') then
    alter table partners add constraint partners_status_check check (status in ('pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partners_source_check') then
    alter table partners add constraint partners_source_check check (source in ('admin', 'self'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partners_email_format') then
    alter table partners add constraint partners_email_format check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  end if;
end $$;
create unique index if not exists partners_portal_token on partners (portal_token);

-- Approved, started, paid (0078), and approved now too. Featured first.
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
    and p.status = 'approved'
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

-- The hotels a listing reaches, whether or not it's paid right now (who a
-- payment's commission is shared between).
create or replace function partner_reach(p_partner_id uuid)
returns setof properties
language sql
stable
security definer
set search_path = public
as $$
  select prop.*
  from partners p, properties prop
  where p.id = p_partner_id
    and prop.partner_listings_enabled
    and not (p.category = any (prop.partner_blocked_categories))
    and (
      exists (select 1 from partner_properties pp where pp.partner_id = p.id and pp.property_id = prop.id)
      or (
        not exists (select 1 from partner_properties pp where pp.partner_id = p.id)
        and p.areas && location_area_parts(prop.location)
      )
    );
$$;
revoke all on function partner_reach(uuid) from public, anon, authenticated;

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
           'takesRequests', p.email is not null
         ) order by p.featured desc, p.turn), '[]'::jsonb)
  into v_items
  from (
    select v.*, coalesce(v.featured_until >= partner_today(), false) as featured, md5(v.id::text || partner_today()::text) as turn
    from partners_visible_at(v_reservation.property_id) v
    order by featured desc, turn
    limit 12
  ) p;

  return jsonb_build_object('area', initcap((location_area_parts(v_location))[1]), 'items', v_items);
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments: online and manual, listing and featured, with commissions
-- ---------------------------------------------------------------------------
alter table partner_payments
  add column if not exists kind text not null default 'listing',
  add column if not exists source text not null default 'manual',
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partner_payments_kind_check') then
    alter table partner_payments add constraint partner_payments_kind_check check (kind in ('listing', 'featured'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partner_payments_source_check') then
    alter table partner_payments add constraint partner_payments_source_check check (source in ('manual', 'online'));
  end if;
end $$;
create unique index if not exists partner_payments_razorpay_payment on partner_payments (razorpay_payment_id) where razorpay_payment_id is not null;

-- Checkouts started from a partner page (Razorpay orders).
create table if not exists partner_orders (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  kind text not null check (kind in ('listing', 'featured')),
  months integer not null check (months between 1 and 12),
  amount_paise integer not null check (amount_paise > 0),
  razorpay_order_id text unique,
  status text not null default 'created' check (status in ('created', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table partner_orders enable row level security;
revoke all on partner_orders from anon, authenticated;

create table if not exists property_partner_commission (
  property_id text primary key references properties(id) on delete cascade,
  pct numeric(5, 2) not null check (pct >= 0 and pct <= 50),
  updated_at timestamptz not null default now()
);
alter table property_partner_commission enable row level security;
revoke all on property_partner_commission from anon;
drop policy if exists property_partner_commission_admin on property_partner_commission;
create policy property_partner_commission_admin on property_partner_commission for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

create table if not exists partner_commissions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references partner_payments(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  property_id text not null references properties(id) on delete cascade,
  pct numeric(5, 2) not null,
  share_of numeric(10, 2) not null,
  amount numeric(10, 2) not null,
  created_at timestamptz not null default now()
);
alter table partner_commissions enable row level security;
revoke all on partner_commissions from anon;
drop policy if exists partner_commissions_admin_read on partner_commissions;
create policy partner_commissions_admin_read on partner_commissions for select to authenticated using (is_platform_admin());

create table if not exists commission_payouts (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  method text,
  reference text,
  paid_at timestamptz not null default now(),
  recorded_by uuid default auth.uid()
);
alter table commission_payouts enable row level security;
revoke all on commission_payouts from anon;
drop policy if exists commission_payouts_admin on commission_payouts;
create policy commission_payouts_admin on commission_payouts for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

-- One payment's commission, if commission is switched on.
create or replace function share_partner_commission(p_payment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment partner_payments%rowtype;
  v_hotels integer;
  v_share numeric;
  v_count integer := 0;
begin
  if not (select commission_enabled from partner_settings where id = 1) then
    return 0;
  end if;
  select * into v_payment from partner_payments where id = p_payment_id;
  if v_payment.id is null or v_payment.amount <= 0 then
    return 0;
  end if;
  select count(*) into v_hotels from partner_reach(v_payment.partner_id);
  if v_hotels = 0 then
    return 0;
  end if;
  v_share := v_payment.amount / v_hotels;
  insert into partner_commissions (payment_id, partner_id, property_id, pct, share_of, amount)
  select v_payment.id, v_payment.partner_id, r.id, c.pct, round(v_share, 2), round(v_share * c.pct / 100, 2)
  from partner_reach(v_payment.partner_id) r
  join property_partner_commission c on c.property_id = r.id and c.pct > 0;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function share_partner_commission(uuid) from public, anon, authenticated;

-- Applies a payment of either kind: extends the listing (from its end
-- while running, from today when lapsed), or the featured spot likewise.
create or replace function apply_partner_payment(
  p_partner_id uuid, p_kind text, p_amount numeric, p_months integer, p_method text, p_reference text,
  p_source text, p_razorpay_order_id text default null, p_razorpay_payment_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner partners%rowtype;
  v_from date;
  v_until date;
  v_payment_id uuid;
begin
  select * into v_partner from partners where id = p_partner_id for update;
  if v_partner.id is null then
    raise exception 'Partner not found';
  end if;
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'Months must be between 1 and 24';
  end if;
  if p_kind not in ('listing', 'featured') then
    raise exception 'Unknown payment kind';
  end if;
  if p_kind = 'featured' and coalesce(v_partner.paid_until, partner_today() - 1) < partner_today() then
    raise exception 'The listing has to be paid up before it can be featured';
  end if;

  if p_kind = 'listing' then
    v_from := greatest(coalesce(v_partner.paid_until, partner_today() - 1), partner_today() - 1) + 1;
  else
    v_from := greatest(coalesce(v_partner.featured_until, partner_today() - 1), partner_today() - 1) + 1;
  end if;
  v_until := (v_from + make_interval(months => p_months))::date - 1;

  insert into partner_payments (partner_id, amount, months, covers_from, paid_until, method, reference, kind, source, razorpay_order_id, razorpay_payment_id)
  values (p_partner_id, round(p_amount, 2), p_months, v_from, v_until, nullif(trim(p_method), ''), nullif(trim(p_reference), ''),
          p_kind, p_source, p_razorpay_order_id, p_razorpay_payment_id)
  returning id into v_payment_id;

  if p_kind = 'listing' then
    update partners set paid_until = v_until where id = p_partner_id;
  else
    update partners set featured_until = v_until where id = p_partner_id;
  end if;
  perform share_partner_commission(v_payment_id);
  return jsonb_build_object('paymentId', v_payment_id, 'kind', p_kind, 'until', v_until);
end;
$$;
revoke all on function apply_partner_payment(uuid, text, numeric, integer, text, text, text, text, text) from public, anon, authenticated;

-- Pulse's manual payment, now of either kind (0078 had listing only).
drop function if exists admin_record_partner_payment(uuid, numeric, integer, text, text);
create or replace function admin_record_partner_payment(p_partner_id uuid, p_amount numeric, p_months integer, p_method text, p_reference text, p_kind text default 'listing')
returns date
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not allowed';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Enter the amount paid';
  end if;
  return (apply_partner_payment(p_partner_id, coalesce(p_kind, 'listing'), p_amount, p_months, p_method, p_reference, 'manual')->>'until')::date;
end;
$$;
revoke all on function admin_record_partner_payment(uuid, numeric, integer, text, text, text) from public, anon;
grant execute on function admin_record_partner_payment(uuid, numeric, integer, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pulse: applications, commissions
-- ---------------------------------------------------------------------------
create or replace function admin_review_partner(p_partner_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner partners%rowtype;
begin
  if not is_platform_admin() then
    raise exception 'Not allowed';
  end if;
  update partners
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_at = now(), review_note = nullif(trim(p_note), '')
  where id = p_partner_id
  returning * into v_partner;
  if v_partner.id is null then
    raise exception 'Partner not found';
  end if;
  return jsonb_build_object('status', v_partner.status, 'email', v_partner.email, 'name', v_partner.name, 'portalToken', v_partner.portal_token);
end;
$$;
revoke all on function admin_review_partner(uuid, boolean, text) from public, anon;
grant execute on function admin_review_partner(uuid, boolean, text) to authenticated;

create or replace function admin_commission_summary()
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
      'propertyId', p.id, 'propertyName', p.name, 'location', p.location,
      'pct', c.pct,
      'earned', coalesce((select sum(amount) from partner_commissions pc where pc.property_id = p.id), 0),
      'paid', coalesce((select sum(amount) from commission_payouts cp where cp.property_id = p.id), 0)
    ) order by p.name), '[]'::jsonb)
    from properties p
    left join property_partner_commission c on c.property_id = p.id
  );
end;
$$;
revoke all on function admin_commission_summary() from public, anon;
grant execute on function admin_commission_summary() to authenticated;

-- Owner: what their hotel has earned from partner listings (shown only when there's any).
create or replace function owner_partner_commission(p_property_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only the property owner can see this';
  end if;
  return jsonb_build_object(
    'pct', (select pct from property_partner_commission where property_id = p_property_id),
    'enabled', (select commission_enabled from partner_settings where id = 1),
    'earned', coalesce((select sum(amount) from partner_commissions where property_id = p_property_id), 0),
    'paid', coalesce((select sum(amount) from commission_payouts where property_id = p_property_id), 0)
  );
end;
$$;
revoke all on function owner_partner_commission(text) from public, anon;
grant execute on function owner_partner_commission(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Guest booking requests
-- ---------------------------------------------------------------------------
create table if not exists partner_requests (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  property_id text not null references properties(id) on delete cascade,
  reservation_id uuid references reservations(id) on delete set null,
  guest_name text,
  guest_phone text,
  hotel_name text not null,
  room_number text,
  message text not null check (length(message) between 2 and 500),
  preferred_time text check (length(preferred_time) <= 80),
  party_size integer check (party_size between 1 and 50),
  status text not null default 'new' check (status in ('new', 'accepted', 'declined', 'done')),
  business_note text check (length(business_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notified_at timestamptz
);
create index if not exists partner_requests_partner on partner_requests (partner_id, created_at desc);
alter table partner_requests enable row level security;
revoke all on partner_requests from anon;
drop policy if exists partner_requests_admin_read on partner_requests;
create policy partner_requests_admin_read on partner_requests for select to authenticated using (is_platform_admin());

-- The guest asks a business for something. Their name, phone and hotel go
-- to that business only because they ticked to share them.
create or replace function guest_partner_request(p_token uuid, p_partner_id uuid, p_message text, p_preferred_time text, p_party_size integer, p_phone text, p_consent boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_guest guests%rowtype;
  v_room text;
  v_hotel text;
  v_phone text;
  v_id uuid;
begin
  select * into v_res from reservations where guest_token = p_token;
  if v_res.id is null then
    raise exception 'Invalid guest link';
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'Tick to share your name and phone so they can reply';
  end if;
  if not exists (select 1 from partners_visible_at(v_res.property_id) p where p.id = p_partner_id and p.email is not null) then
    raise exception 'This business isn’t taking requests here right now';
  end if;
  if (select count(*) from partner_requests where reservation_id = v_res.id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You’ve sent a lot of requests today. Call them instead.';
  end if;
  select * into v_guest from guests where id = v_res.guest_id;
  v_phone := coalesce(nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), ''), v_guest.phone);
  if v_phone is null or length(regexp_replace(v_phone, '\D', '', 'g')) < 10 then
    raise exception 'Add a phone number they can reach you on';
  end if;
  select number into v_room from rooms where id = v_res.room_id;
  select name into v_hotel from properties where id = v_res.property_id;

  insert into partner_requests (partner_id, property_id, reservation_id, guest_name, guest_phone, hotel_name, room_number, message, preferred_time, party_size)
  values (p_partner_id, v_res.property_id, v_res.id, coalesce(v_guest.name, 'Guest'), v_phone, v_hotel, v_room,
          trim(p_message), nullif(trim(p_preferred_time), ''), p_party_size)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'new');
end;
$$;
revoke all on function guest_partner_request(uuid, uuid, text, text, integer, text, boolean) from public;
grant execute on function guest_partner_request(uuid, uuid, text, text, integer, text, boolean) to anon, authenticated;

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
      'preferredTime', r.preferred_time, 'status', r.status, 'businessNote', r.business_note, 'createdAt', r.created_at
    ) order by r.created_at desc), '[]'::jsonb)
    from partner_requests r join partners p on p.id = r.partner_id
    where r.reservation_id = v_res.id
  );
end;
$$;
revoke all on function guest_partner_requests(uuid) from public;
grant execute on function guest_partner_requests(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The business's own partner page (/partner/:portal_token)
-- ---------------------------------------------------------------------------
create or replace function partner_portal_get(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p partners%rowtype;
begin
  select * into v_p from partners where portal_token = p_token;
  if v_p.id is null then
    raise exception 'This partner link isn’t valid';
  end if;
  return jsonb_build_object(
    'partner', jsonb_build_object(
      'id', v_p.id, 'name', v_p.name, 'category', v_p.category, 'tagline', v_p.tagline, 'description', v_p.description,
      'photo', v_p.photo_url, 'phone', v_p.phone, 'whatsapp', v_p.whatsapp, 'email', v_p.email, 'ownerName', v_p.owner_name,
      'address', v_p.address, 'openingHours', v_p.opening_hours, 'offerText', v_p.offer_text, 'offerCode', v_p.offer_code,
      'areas', to_jsonb(v_p.areas), 'status', v_p.status, 'reviewNote', v_p.review_note, 'active', v_p.active,
      'paidUntil', v_p.paid_until, 'featuredUntil', v_p.featured_until, 'appliedAt', v_p.applied_at
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
      select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'amount', amount, 'months', months, 'coversFrom', covers_from, 'paidUntil', paid_until, 'source', source, 'createdAt', created_at) order by created_at desc), '[]'::jsonb)
      from partner_payments where partner_id = v_p.id
    ),
    'requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'guestName', guest_name, 'guestPhone', guest_phone, 'hotelName', hotel_name, 'roomNumber', room_number,
        'message', message, 'preferredTime', preferred_time, 'partySize', party_size, 'status', status,
        'businessNote', business_note, 'createdAt', created_at
      ) order by created_at desc), '[]'::jsonb)
      from (select * from partner_requests where partner_id = v_p.id order by created_at desc limit 100) r
    )
  );
end;
$$;
revoke all on function partner_portal_get(uuid) from public;
grant execute on function partner_portal_get(uuid) to anon, authenticated;

create or replace function partner_portal_update_request(p_token uuid, p_request_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p partners%rowtype;
begin
  select * into v_p from partners where portal_token = p_token;
  if v_p.id is null then
    raise exception 'This partner link isn’t valid';
  end if;
  if p_status not in ('accepted', 'declined', 'done') then
    raise exception 'Unknown status';
  end if;
  update partner_requests
  set status = p_status, business_note = coalesce(nullif(trim(p_note), ''), business_note), updated_at = now()
  where id = p_request_id and partner_id = v_p.id;
  if not found then
    raise exception 'Request not found';
  end if;
end;
$$;
revoke all on function partner_portal_update_request(uuid, uuid, text, text) from public;
grant execute on function partner_portal_update_request(uuid, uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Emails: a log, a new-request trigger and the daily mailer
-- ---------------------------------------------------------------------------
create table if not exists partner_email_log (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  unique (partner_id, kind, ref)
);
alter table partner_email_log enable row level security;
revoke all on partner_email_log from anon, authenticated;

-- A new guest request emails the business straight away (partner-mailer).
create or replace function partner_requests_notify()
returns trigger
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
      body := jsonb_build_object('job', 'request', 'requestId', new.id),
      timeout_milliseconds := 20000
    );
  end if;
  return new;
end;
$$;
drop trigger if exists partner_requests_notify on partner_requests;
create trigger partner_requests_notify after insert on partner_requests
for each row execute function partner_requests_notify();

-- Daily at 10:00 IST: renewal reminders, lapsed notices, and on the 1st the monthly report.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'partner-mailer';
    perform cron.schedule('partner-mailer', '30 4 * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/partner-mailer',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'id_document_purge_cron_secret')
        ),
        body := '{"job": "daily"}'::jsonb,
        timeout_milliseconds := 60000
      )
    $job$);
  end if;
end $$;

-- What the mailer sends a business about a month (service role only).
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
    'hotels', (select count(distinct e2.property_id) from partner_events e2 where e2.partner_id = p_partner_id and (e2.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to)
  )
  from partner_events e
  where e.partner_id = p_partner_id and (e.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to;
$$;
revoke all on function system_partner_month(uuid, date, date) from public, anon, authenticated;
grant execute on function system_partner_month(uuid, date, date) to service_role;
grant execute on function apply_partner_payment(uuid, text, numeric, integer, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Self sign-up (partner-signup Edge Function, service role)
-- ---------------------------------------------------------------------------
create table if not exists partner_signup_log (
  id bigserial primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists partner_signup_log_ip on partner_signup_log (ip_hash, created_at desc);
alter table partner_signup_log enable row level security;
revoke all on partner_signup_log from anon, authenticated;

-- A business applies. Pending until an admin approves it; never visible to
-- guests before then. Three applications an hour from one address at most.
create or replace function system_partner_apply(p jsonb, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_areas text[];
  v_email text := lower(trim(p->>'email'));
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g');
  v_row partners%rowtype;
begin
  if (select count(*) from partner_signup_log where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Too many applications from here. Try again in an hour.';
  end if;
  insert into partner_signup_log (ip_hash) values (p_ip_hash);

  if length(trim(coalesce(p->>'name', ''))) < 2 then
    raise exception 'Enter your business name';
  end if;
  if coalesce(p->>'category', '') not in ('restaurant', 'cafe', 'taxi', 'tours', 'adventure', 'spa', 'shopping', 'other') then
    raise exception 'Pick what kind of business it is';
  end if;
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter an email we can reach you on';
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
  if exists (select 1 from partners where lower(email) = v_email and status = 'pending') then
    raise exception 'You’ve already applied with this email. We’ll be in touch soon.';
  end if;

  insert into partners (name, category, tagline, description, photo_url, phone, whatsapp, maps_url, address, opening_hours,
                        offer_text, areas, active, status, source, email, owner_name, contact_person, applied_at)
  values (
    left(trim(p->>'name'), 80), p->>'category',
    nullif(left(trim(coalesce(p->>'tagline', '')), 120), ''),
    nullif(left(trim(coalesce(p->>'description', '')), 600), ''),
    case when p->>'photo' ~ '^https://' then p->>'photo' end,
    v_phone,
    nullif(regexp_replace(coalesce(p->>'whatsapp', ''), '[^0-9+]', '', 'g'), ''),
    case when p->>'mapsUrl' ~ '^https://' then left(p->>'mapsUrl', 500) end,
    nullif(left(trim(coalesce(p->>'address', '')), 200), ''),
    nullif(left(trim(coalesce(p->>'openingHours', '')), 80), ''),
    nullif(left(trim(coalesce(p->>'offerText', '')), 120), ''),
    v_areas, true, 'pending', 'self', v_email,
    nullif(left(trim(coalesce(p->>'ownerName', '')), 80), ''),
    nullif(left(trim(coalesce(p->>'ownerName', '')), 80), ''),
    now()
  )
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'name', v_row.name, 'email', v_row.email, 'ownerName', v_row.owner_name, 'portalToken', v_row.portal_token);
end;
$$;
revoke all on function system_partner_apply(jsonb, text) from public, anon, authenticated;
grant execute on function system_partner_apply(jsonb, text) to service_role;

-- Approval or rejection emails the business (partner-mailer, job 'review').
create or replace function partners_review_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') and new.email is not null
     and exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from vault.decrypted_secrets where name = 'project_url') then
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/partner-mailer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'id_document_purge_cron_secret')
      ),
      body := jsonb_build_object('job', 'review', 'partnerId', new.id),
      timeout_milliseconds := 20000
    );
  end if;
  return new;
end;
$$;
drop trigger if exists partners_review_notify on partners;
create trigger partners_review_notify after update of status on partners
for each row execute function partners_review_notify();

-- ---------------------------------------------------------------------------
-- Online payment from the partner page (service role, via Edge Functions)
-- ---------------------------------------------------------------------------
-- Starts a checkout: works out the price from partner_settings so the
-- browser can't name its own amount.
create or replace function system_create_partner_order(p_token uuid, p_kind text, p_months integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p partners%rowtype;
  v_fee numeric;
  v_order partner_orders%rowtype;
begin
  select * into v_p from partners where portal_token = p_token;
  if v_p.id is null then
    raise exception 'This partner link isn’t valid';
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
  select case p_kind when 'listing' then listing_fee_monthly when 'featured' then featured_fee_monthly end
  into v_fee from partner_settings where id = 1;
  if v_fee is null then
    raise exception 'Unknown payment kind';
  end if;
  if v_fee * p_months < 1 then
    raise exception 'Nothing to pay';
  end if;
  insert into partner_orders (partner_id, kind, months, amount_paise)
  values (v_p.id, p_kind, p_months, round(v_fee * p_months * 100)::integer)
  returning * into v_order;
  return jsonb_build_object('orderId', v_order.id, 'amountPaise', v_order.amount_paise, 'partnerName', v_p.name, 'email', v_p.email, 'phone', v_p.phone);
end;
$$;
revoke all on function system_create_partner_order(uuid, text, integer) from public, anon, authenticated;
grant execute on function system_create_partner_order(uuid, text, integer) to service_role;

-- Applies a verified Razorpay payment exactly once.
create or replace function system_fulfil_partner_order(p_order_id uuid, p_razorpay_payment_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order partner_orders%rowtype;
  v_result jsonb;
  v_p partners%rowtype;
begin
  select * into v_order from partner_orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;
  select * into v_p from partners where id = v_order.partner_id;
  if v_order.status = 'paid' then
    return jsonb_build_object('alreadyPaid', true, 'kind', v_order.kind,
      'until', case v_order.kind when 'listing' then v_p.paid_until else v_p.featured_until end);
  end if;
  v_result := apply_partner_payment(v_order.partner_id, v_order.kind, v_order.amount_paise / 100.0, v_order.months,
                                    'Razorpay', p_razorpay_payment_id, 'online', v_order.razorpay_order_id, p_razorpay_payment_id);
  update partner_orders set status = 'paid', paid_at = now() where id = v_order.id;
  return v_result || jsonb_build_object('alreadyPaid', false, 'amount', round(v_order.amount_paise / 100.0, 2), 'months', v_order.months,
                                        'partnerName', v_p.name, 'email', v_p.email, 'portalToken', v_p.portal_token);
end;
$$;
revoke all on function system_fulfil_partner_order(uuid, text) from public, anon, authenticated;
grant execute on function system_fulfil_partner_order(uuid, text) to service_role;

-- Guests' names and phones don't stay with us forever: cleared from
-- requests 60 days on (the request itself stays for the counts).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'partner-requests-tidy';
    perform cron.schedule('partner-requests-tidy', '15 21 * * *', $job$
      update partner_requests set guest_name = null, guest_phone = null, room_number = null
      where created_at < now() - interval '60 days' and (guest_name is not null or guest_phone is not null)
    $job$);
  end if;
end $$;

-- Pulse: settings in one call.
create or replace function admin_save_partner_settings(p_listing_fee numeric, p_featured_fee numeric, p_commission_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not allowed';
  end if;
  update partner_settings
  set listing_fee_monthly = coalesce(p_listing_fee, listing_fee_monthly),
      featured_fee_monthly = coalesce(p_featured_fee, featured_fee_monthly),
      commission_enabled = coalesce(p_commission_enabled, commission_enabled),
      updated_at = now()
  where id = 1;
end;
$$;
revoke all on function admin_save_partner_settings(numeric, numeric, boolean) from public, anon;
grant execute on function admin_save_partner_settings(numeric, numeric, boolean) to authenticated;
