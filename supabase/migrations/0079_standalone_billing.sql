-- Standalone PMS, phase 1: billing.
--
-- Until now the built-in front desk never charged room rent: a stay's bill
-- held only food, services and experiences, payments were negative
-- "deposit" lines, and check-out marked everything paid in one method. A
-- hotel with no other PMS couldn't run on that. This adds:
--
--   * Room rent, posted the way PMSs do it: a nightly audit (pg_cron, 23:30
--     IST) adds that night's charge for every in-house guest, once per night
--     (a unique index makes it idempotent), at the rate agreed on the
--     booking. Check-out and opening the bill catch up any night a missed
--     run skipped. Only for properties without their own PMS: a hotel that
--     uses another PMS bills its rooms there.
--   * GST, optional per property. When on, every charge gets its rate at
--     posting time: rooms by the per-night threshold (default up to
--     ₹7,500 at 5%, above at 18%), food 5%, everything else 18%. All
--     editable by the owner; prices are before tax.
--   * folio_payments: a real ledger of money received and refunded, by
--     method (cash, card, UPI, bank, other), partial and mixed. Nothing
--     here is ever deleted or edited: a mistake is voided, by the owner,
--     with a reason. Bill lines likewise.
--   * Numbered bills: issued at check-out, one series per property per
--     financial year (PREFIX/25-26/0001), frozen as a snapshot so later
--     changes to settings never alter an issued bill, and readable by the
--     guest through an unguessable link.
--
-- Existing data: negative "deposit" lines move to folio_payments (the
-- lines are voided, not deleted), and stays already checked out get one
-- payment for what was collected at check-out, so their balance stays 0.
-- Apply after 0001-0078.

-- ---------------------------------------------------------------------------
-- Dates: a hotel's day is an Indian day.
-- ---------------------------------------------------------------------------
create or replace function ist_date(p_ts timestamptz)
returns date
language sql
immutable
as $$ select (p_ts at time zone 'Asia/Kolkata')::date; $$;

create or replace function ist_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Kolkata')::date; $$;

-- Indian financial year label: 2026-10-25 -> '26-27'.
create or replace function fy_label(p_date date)
returns text
language sql
immutable
as $$
  select to_char(make_date(y, 1, 1), 'YY') || '-' || to_char(make_date(y + 1, 1, 1), 'YY')
  from (select case when extract(month from p_date) >= 4 then extract(year from p_date)::int else extract(year from p_date)::int - 1 end as y) x;
$$;

-- ---------------------------------------------------------------------------
-- Property billing settings
-- ---------------------------------------------------------------------------
alter table properties
  add column if not exists legal_name text,
  add column if not exists billing_address text,
  add column if not exists billing_phone text,
  add column if not exists billing_email text,
  add column if not exists gstin text,
  add column if not exists gst_enabled boolean not null default false,
  add column if not exists gst_room_low_rate numeric(5, 2) not null default 5,
  add column if not exists gst_room_high_rate numeric(5, 2) not null default 18,
  add column if not exists gst_room_threshold numeric(10, 2) not null default 7500,
  add column if not exists gst_food_rate numeric(5, 2) not null default 5,
  add column if not exists gst_other_rate numeric(5, 2) not null default 18,
  add column if not exists invoice_prefix text not null default 'INV';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_gstin_format') then
    alter table properties add constraint properties_gstin_format
      check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_invoice_prefix_format') then
    -- At most 5 so a full number (PREFIX/25-26/0001) stays within GST's 16 characters.
    alter table properties add constraint properties_invoice_prefix_format
      check (invoice_prefix ~ '^[A-Z0-9]{1,5}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_gst_rates_sane') then
    alter table properties add constraint properties_gst_rates_sane check (
      gst_room_low_rate between 0 and 28 and gst_room_high_rate between 0 and 28 and
      gst_food_rate between 0 and 28 and gst_other_rate between 0 and 28 and gst_room_threshold >= 0
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reservations: the rate agreed for this stay
-- ---------------------------------------------------------------------------
alter table reservations add column if not exists rate_per_night numeric(10, 2) check (rate_per_night >= 0);

update reservations r
set rate_per_night = rm.price_per_night
from rooms rm
where rm.id = r.room_id and r.rate_per_night is null;

create or replace function reservations_default_rate()
returns trigger
language plpgsql
as $$
begin
  if new.rate_per_night is null and new.room_id is not null then
    select price_per_night into new.rate_per_night from rooms where id = new.room_id;
  end if;
  return new;
end;
$$;
drop trigger if exists reservations_default_rate on reservations;
create trigger reservations_default_rate before insert on reservations
for each row execute function reservations_default_rate();

-- ---------------------------------------------------------------------------
-- Bill lines (folio_charges): room nights, tax, voids
-- ---------------------------------------------------------------------------
alter table folio_charges
  add column if not exists stay_date date,
  add column if not exists tax_rate numeric(5, 2) not null default 0,
  add column if not exists tax_amount numeric(10, 2) not null default 0,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text,
  add column if not exists voided_by uuid;

alter table folio_charges drop constraint if exists folio_charges_category_check;
alter table folio_charges add constraint folio_charges_category_check
  check (category in ('room', 'room_service', 'spa', 'laundry', 'minibar', 'extra', 'deposit', 'other'));
alter table folio_charges drop constraint if exists folio_charges_payment_method_check;
alter table folio_charges add constraint folio_charges_payment_method_check
  check (payment_method in ('cash', 'card', 'upi', 'bank', 'other'));

-- One room charge per night per stay, ever: a voided night (a comp) is not
-- re-posted by the next audit.
create unique index if not exists folio_room_night_once
  on folio_charges (reservation_id, stay_date) where category = 'room';

create or replace function folio_charge_apply_tax()
returns trigger
language plpgsql
as $$
declare
  v_prop properties%rowtype;
begin
  if new.amount <= 0 or new.category = 'deposit' or coalesce(new.tax_rate, 0) > 0 then
    return new;
  end if;
  select * into v_prop from properties where id = new.property_id;
  if not coalesce(v_prop.gst_enabled, false) then
    return new;
  end if;
  new.tax_rate := case
    when new.category = 'room' then
      case when new.amount <= v_prop.gst_room_threshold then v_prop.gst_room_low_rate else v_prop.gst_room_high_rate end
    when new.category = 'room_service' then v_prop.gst_food_rate
    else v_prop.gst_other_rate
  end;
  new.tax_amount := round(new.amount * new.tax_rate / 100, 2);
  return new;
end;
$$;
drop trigger if exists folio_charge_apply_tax on folio_charges;
create trigger folio_charge_apply_tax before insert on folio_charges
for each row execute function folio_charge_apply_tax();

-- A posted line's money never changes; it can only be voided (or marked
-- settled, which the legacy reports still read).
create or replace function folio_charges_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Bill lines are never deleted; void it instead';
  end if;
  if new.amount is distinct from old.amount or new.tax_amount is distinct from old.tax_amount
     or new.tax_rate is distinct from old.tax_rate or new.reservation_id is distinct from old.reservation_id
     or new.category is distinct from old.category or new.stay_date is distinct from old.stay_date then
    raise exception 'A posted bill line can''t be changed; void it and post a new one';
  end if;
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'A voided line stays voided';
  end if;
  return new;
end;
$$;
drop trigger if exists folio_charges_guard on folio_charges;
create trigger folio_charges_guard before update or delete on folio_charges
for each row execute function folio_charges_guard();

-- ---------------------------------------------------------------------------
-- Payments ledger
-- ---------------------------------------------------------------------------
create table if not exists folio_payments (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  reservation_id uuid not null references reservations(id),
  kind text not null default 'payment' check (kind in ('payment', 'refund')),
  amount numeric(10, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'card', 'upi', 'bank', 'other')),
  reference text,
  note text,
  received_at timestamptz not null default now(),
  received_by uuid default auth.uid(),
  voided_at timestamptz,
  void_reason text,
  voided_by uuid,
  -- Where a row came from when 0079 moved older data in; null for new ones.
  legacy_source text check (legacy_source in ('deposit_line', 'checkout_settlement')),
  legacy_charge_id uuid
);
create index if not exists folio_payments_reservation on folio_payments (reservation_id);
create index if not exists folio_payments_property_time on folio_payments (property_id, received_at);

alter table folio_payments enable row level security;
revoke all on folio_payments from anon;
drop policy if exists folio_payments_staff_read on folio_payments;
create policy folio_payments_staff_read on folio_payments for select to authenticated
  using (is_staff_for_property(property_id));

create or replace function folio_payments_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payments are never deleted; void it instead';
  end if;
  if (new.id, new.property_id, new.reservation_id, new.kind, new.amount, new.method, new.reference, new.note, new.received_at, new.received_by)
     is distinct from
     (old.id, old.property_id, old.reservation_id, old.kind, old.amount, old.method, old.reference, old.note, old.received_at, old.received_by) then
    raise exception 'A recorded payment can''t be changed; void it and record it again';
  end if;
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'A voided payment stays voided';
  end if;
  return new;
end;
$$;
drop trigger if exists folio_payments_guard on folio_payments;
create trigger folio_payments_guard before update or delete on folio_payments
for each row execute function folio_payments_guard();

-- Move existing negative deposit lines into the ledger (once).
insert into folio_payments (property_id, reservation_id, kind, amount, method, note, received_at, received_by, legacy_source, legacy_charge_id)
select c.property_id, c.reservation_id, 'payment', abs(c.amount), coalesce(c.payment_method, 'other'),
       c.description, c.posted_at, null, 'deposit_line', c.id
from folio_charges c
where c.category = 'deposit' and c.amount < 0 and c.voided_at is null and c.reservation_id is not null
  and not exists (select 1 from folio_payments p where p.legacy_charge_id = c.id);

update folio_charges
set voided_at = now(), void_reason = 'Moved to payments (0079)'
where category = 'deposit' and amount < 0 and voided_at is null;

-- What older check-outs collected: everything settled, less the deposits
-- that had already paid for part of it.
insert into folio_payments (property_id, reservation_id, kind, amount, method, note, received_at, received_by, legacy_source)
select r.property_id, r.id, 'payment', s.settled - coalesce(d.deposits, 0), coalesce(s.method, 'other'),
       'Settled at check-out', s.settled_at, null, 'checkout_settlement'
from reservations r
join lateral (
  select sum(c.amount) as settled, max(c.settled_at) as settled_at,
         mode() within group (order by c.payment_method) as method
  from folio_charges c
  where c.reservation_id = r.id and c.category <> 'deposit' and c.amount > 0 and c.settled_at is not null and c.voided_at is null
) s on true
left join lateral (
  select sum(p.amount) as deposits from folio_payments p where p.reservation_id = r.id and p.legacy_source = 'deposit_line'
) d on true
where s.settled is not null
  and s.settled - coalesce(d.deposits, 0) > 0.005
  and not exists (select 1 from folio_payments p where p.reservation_id = r.id and p.legacy_source = 'checkout_settlement');

-- ---------------------------------------------------------------------------
-- Totals
-- ---------------------------------------------------------------------------
create or replace function folio_totals(p_reservation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select coalesce(sum(amount), 0) as subtotal, coalesce(sum(tax_amount), 0) as tax
    from folio_charges
    where reservation_id = p_reservation_id and voided_at is null and category <> 'deposit'
  ), p as (
    select coalesce(sum(amount) filter (where kind = 'payment'), 0) as paid,
           coalesce(sum(amount) filter (where kind = 'refund'), 0) as refunded
    from folio_payments
    where reservation_id = p_reservation_id and voided_at is null
  )
  select jsonb_build_object(
    'subtotal', c.subtotal, 'tax', c.tax, 'total', c.subtotal + c.tax,
    'paid', p.paid, 'refunded', p.refunded,
    'balance', round(c.subtotal + c.tax - p.paid + p.refunded, 2)
  )
  from c, p;
$$;
revoke all on function folio_totals(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Room nights and the night audit
-- ---------------------------------------------------------------------------
-- Posts a room charge for each night of the stay from check-in through
-- p_through (inclusive) that isn't posted yet. Returns how many it posted.
create or replace function post_room_nights(p_reservation_id uuid, p_through date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_room rooms%rowtype;
  v_external boolean;
  v_rate numeric;
  v_night date;
  v_count integer := 0;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if v_res.id is null or v_res.status not in ('checked_in', 'checked_out') or v_res.room_id is null then
    return 0;
  end if;
  select has_external_pms into v_external from properties where id = v_res.property_id;
  if coalesce(v_external, false) then
    return 0;
  end if;
  select * into v_room from rooms where id = v_res.room_id;
  v_rate := coalesce(v_res.rate_per_night, v_room.price_per_night, 0);
  if v_rate <= 0 then
    return 0;
  end if;

  for v_night in select d::date from generate_series(ist_date(v_res.check_in), p_through, interval '1 day') d loop
    insert into folio_charges (property_id, reservation_id, description, amount, category, stay_date)
    values (v_res.property_id, v_res.id,
            'Room ' || coalesce(v_room.number, '') || ' · night of ' || to_char(v_night, 'Dy DD Mon'),
            v_rate, 'room', v_night)
    on conflict do nothing;
    if found then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function post_room_nights(uuid, date) from public, anon, authenticated;

create or replace function system_night_audit()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res record;
  v_total integer := 0;
begin
  for v_res in
    select r.id from reservations r join properties p on p.id = r.property_id
    where r.status = 'checked_in' and not coalesce(p.has_external_pms, false)
  loop
    v_total := v_total + post_room_nights(v_res.id, ist_today());
  end loop;
  return v_total;
end;
$$;
revoke all on function system_night_audit() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'night-audit';
    -- 18:00 UTC = 23:30 IST.
    perform cron.schedule('night-audit', '0 18 * * *', 'select system_night_audit()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The bill (shared by the folio, the printed bill and the guest's link)
-- ---------------------------------------------------------------------------
create or replace function build_bill(p_reservation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_prop properties%rowtype;
  v_room rooms%rowtype;
  v_guest guests%rowtype;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if v_res.id is null then
    return null;
  end if;
  select * into v_prop from properties where id = v_res.property_id;
  select * into v_room from rooms where id = v_res.room_id;
  select * into v_guest from guests where id = v_res.guest_id;

  return jsonb_build_object(
    'currency', coalesce(v_prop.currency, 'INR'),
    'hotel', jsonb_build_object(
      'name', v_prop.name, 'legalName', v_prop.legal_name, 'address', coalesce(v_prop.billing_address, v_prop.location),
      'phone', v_prop.billing_phone, 'email', v_prop.billing_email,
      'gstin', case when v_prop.gst_enabled then v_prop.gstin end, 'gstEnabled', v_prop.gst_enabled
    ),
    'guest', jsonb_build_object('name', v_guest.name, 'phone', v_guest.phone, 'email', v_guest.email),
    'stay', jsonb_build_object(
      'room', v_room.number, 'roomType', v_room.type,
      'checkIn', v_res.check_in, 'checkOut', coalesce(v_res.checked_out_at, v_res.check_out),
      'nights', (select count(*) from folio_charges where reservation_id = v_res.id and category = 'room' and voided_at is null),
      'ratePerNight', v_res.rate_per_night, 'guests', v_res.party_size
    ),
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', coalesce(stay_date, ist_date(posted_at)), 'description', description, 'category', category,
               'amount', amount, 'taxRate', tax_rate, 'taxAmount', tax_amount
             ) order by coalesce(stay_date, ist_date(posted_at)), posted_at), '[]'::jsonb)
      from folio_charges
      where reservation_id = v_res.id and voided_at is null and category <> 'deposit'
    ),
    -- GST within the state is split equally into CGST and SGST.
    'taxSummary', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'rate', tax_rate, 'taxable', taxable, 'tax', tax, 'cgst', round(tax / 2, 2), 'sgst', tax - round(tax / 2, 2)
             ) order by tax_rate), '[]'::jsonb)
      from (
        select tax_rate, sum(amount) as taxable, sum(tax_amount) as tax
        from folio_charges
        where reservation_id = v_res.id and voided_at is null and category <> 'deposit' and tax_rate > 0
        group by tax_rate
      ) t
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', received_at, 'kind', kind, 'method', method, 'amount', amount, 'reference', reference
             ) order by received_at), '[]'::jsonb)
      from folio_payments where reservation_id = v_res.id and voided_at is null
    ),
    'totals', folio_totals(v_res.id)
  );
end;
$$;
revoke all on function build_bill(uuid) from public, anon, authenticated;

create table if not exists invoice_counters (
  property_id text not null references properties(id) on delete cascade,
  fy text not null,
  last_seq integer not null default 0,
  primary key (property_id, fy)
);
alter table invoice_counters enable row level security;
revoke all on invoice_counters from anon, authenticated;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  reservation_id uuid not null unique references reservations(id),
  number text not null,
  fy text not null,
  seq integer not null,
  issued_at timestamptz not null default now(),
  issued_by uuid default auth.uid(),
  share_token uuid not null unique default gen_random_uuid(),
  snapshot jsonb not null,
  unique (property_id, number)
);
alter table invoices enable row level security;
revoke all on invoices from anon;
drop policy if exists invoices_staff_read on invoices;
create policy invoices_staff_read on invoices for select to authenticated using (is_staff_for_property(property_id));

create or replace function invoices_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception 'An issued bill can''t be changed or deleted';
end;
$$;
drop trigger if exists invoices_guard on invoices;
create trigger invoices_guard before update or delete on invoices
for each row execute function invoices_guard();

-- Issues the stay's numbered bill (once; returns the existing one after that).
create or replace function issue_invoice(p_reservation_id uuid)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice invoices%rowtype;
  v_res reservations%rowtype;
  v_prefix text;
  v_fy text := fy_label(ist_today());
  v_seq integer;
  v_number text;
begin
  select * into v_invoice from invoices where reservation_id = p_reservation_id;
  if v_invoice.id is not null then
    return v_invoice;
  end if;
  select * into v_res from reservations where id = p_reservation_id;
  select invoice_prefix into v_prefix from properties where id = v_res.property_id;

  insert into invoice_counters (property_id, fy, last_seq) values (v_res.property_id, v_fy, 1)
  on conflict (property_id, fy) do update set last_seq = invoice_counters.last_seq + 1
  returning last_seq into v_seq;
  v_number := coalesce(v_prefix, 'INV') || '/' || v_fy || '/' || lpad(v_seq::text, 4, '0');

  insert into invoices (property_id, reservation_id, number, fy, seq, snapshot)
  values (v_res.property_id, p_reservation_id, v_number, v_fy, v_seq,
          build_bill(p_reservation_id) || jsonb_build_object('number', v_number, 'issuedAt', now()))
  returning * into v_invoice;
  return v_invoice;
end;
$$;
revoke all on function issue_invoice(uuid) from public, anon, authenticated;

-- The guest's link. Only what's on the bill; nothing else about the stay.
create or replace function public_get_invoice(p_share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select snapshot from invoices where share_token = p_share_token;
$$;
revoke all on function public_get_invoice(uuid) from public;
grant execute on function public_get_invoice(uuid) to anon, authenticated;

-- Staff: the issued bill, or the bill so far (not numbered) before check-out.
create or replace function staff_get_bill(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_invoice invoices%rowtype;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if v_res.id is null or not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  select * into v_invoice from invoices where reservation_id = p_reservation_id;
  if v_invoice.id is not null then
    return v_invoice.snapshot || jsonb_build_object('shareToken', v_invoice.share_token);
  end if;
  if v_res.status = 'checked_in' then
    perform post_room_nights(v_res.id, ist_today() - 1);
  end if;
  return build_bill(p_reservation_id) || jsonb_build_object('number', null, 'provisional', true);
end;
$$;
revoke all on function staff_get_bill(uuid) from public, anon;
grant execute on function staff_get_bill(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The folio, as the front desk sees it
-- ---------------------------------------------------------------------------
create or replace function staff_get_folio(p_reservation_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res_uuid uuid;
  v_res reservations%rowtype;
  v_prop properties%rowtype;
  v_totals jsonb;
  v_invoice invoices%rowtype;
begin
  begin
    v_res_uuid := p_reservation_id::uuid;
  exception when others then
    v_res_uuid := null;
  end;
  if v_res_uuid is not null then
    select * into v_res from reservations where id = v_res_uuid;
  end if;
  if v_res.id is null then
    select * into v_res from reservations
    where room_id = p_reservation_id
    order by (case when status = 'checked_in' then 1 else 2 end), created_at desc
    limit 1;
  end if;
  if v_res.id is null then
    return jsonb_build_object(
      'reservationId', p_reservation_id, 'status', 'checked_in', 'checkIn', now(), 'checkOut', now(),
      'charges', '[]'::jsonb, 'payments', '[]'::jsonb, 'totalOutstanding', 0, 'totalPaid', 0,
      'totals', jsonb_build_object('subtotal', 0, 'tax', 0, 'total', 0, 'paid', 0, 'refunded', 0, 'balance', 0)
    );
  end if;
  if not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;

  -- A missed audit heals itself: every night before tonight is on the bill.
  if v_res.status = 'checked_in' then
    perform post_room_nights(v_res.id, ist_today() - 1);
  end if;

  select * into v_prop from properties where id = v_res.property_id;
  select * into v_invoice from invoices where reservation_id = v_res.id;
  v_totals := folio_totals(v_res.id);

  return jsonb_build_object(
    'reservationId', v_res.id,
    'status', v_res.status,
    'checkIn', v_res.check_in,
    'checkOut', v_res.check_out,
    'ratePerNight', v_res.rate_per_night,
    'billsRoomNights', not coalesce(v_prop.has_external_pms, false),
    'gstEnabled', v_prop.gst_enabled,
    'charges', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'description', description, 'amount', amount, 'category', category,
        'postedAt', posted_at, 'stayDate', stay_date, 'taxRate', tax_rate, 'taxAmount', tax_amount,
        'settled', settled_at is not null, 'voided', voided_at is not null, 'voidReason', void_reason
      ) order by coalesce(stay_date, ist_date(posted_at)), posted_at), '[]'::jsonb)
      from folio_charges where reservation_id = v_res.id and category <> 'deposit'
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'kind', kind, 'amount', amount, 'method', method, 'reference', reference, 'note', note,
        'receivedAt', received_at, 'voided', voided_at is not null, 'voidReason', void_reason
      ) order by received_at), '[]'::jsonb)
      from folio_payments where reservation_id = v_res.id
    ),
    'totals', v_totals,
    -- Kept for older screens: what's still due, and what's been paid.
    'totalOutstanding', (v_totals->>'balance')::numeric,
    'totalPaid', (v_totals->>'paid')::numeric - (v_totals->>'refunded')::numeric,
    'invoice', case when v_invoice.id is null then null
                    else jsonb_build_object('number', v_invoice.number, 'shareToken', v_invoice.share_token, 'issuedAt', v_invoice.issued_at) end
  );
end;
$$;
revoke all on function staff_get_folio(text) from public, anon;
grant execute on function staff_get_folio(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Money in and out, charges, voids
-- ---------------------------------------------------------------------------
drop function if exists staff_record_folio_payment(uuid, numeric, text, text);
create or replace function staff_record_folio_payment(
  p_reservation_id uuid, p_amount numeric, p_description text, p_method text,
  p_reference text default null, p_kind text default 'payment'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_id uuid;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if v_res.id is null then
    raise exception 'Reservation not found';
  end if;
  if not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount above zero';
  end if;
  if p_method not in ('cash', 'card', 'upi', 'bank', 'other') then
    raise exception 'Invalid payment method: %', p_method;
  end if;
  if coalesce(p_kind, 'payment') not in ('payment', 'refund') then
    raise exception 'Invalid kind';
  end if;
  if v_res.status = 'cancelled' and coalesce(p_kind, 'payment') = 'payment' then
    raise exception 'This booking is cancelled';
  end if;

  insert into folio_payments (property_id, reservation_id, kind, amount, method, reference, note)
  values (v_res.property_id, v_res.id, coalesce(p_kind, 'payment'), round(p_amount, 2), p_method,
          nullif(trim(p_reference), ''),
          coalesce(nullif(trim(p_description), ''), case when p_kind = 'refund' then 'Refund' else 'Payment received' end))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function staff_record_folio_payment(uuid, numeric, text, text, text, text) from public, anon;
grant execute on function staff_record_folio_payment(uuid, numeric, text, text, text, text) to authenticated;

-- A charge the desk adds by hand: extra bed, laundry, a damaged towel.
create or replace function staff_add_folio_charge(p_reservation_id uuid, p_description text, p_amount numeric, p_category text default 'extra')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_id uuid;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if v_res.id is null or not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_res.status not in ('upcoming', 'checked_in') then
    raise exception 'Charges can only be added before check-out';
  end if;
  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'Say what the charge is for';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount above zero';
  end if;
  if coalesce(p_category, 'extra') not in ('room_service', 'spa', 'laundry', 'minibar', 'extra', 'other') then
    raise exception 'Invalid category';
  end if;
  insert into folio_charges (property_id, reservation_id, description, amount, category)
  values (v_res.property_id, v_res.id, trim(p_description), round(p_amount, 2), coalesce(p_category, 'extra'))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function staff_add_folio_charge(uuid, text, numeric, text) from public, anon;
grant execute on function staff_add_folio_charge(uuid, text, numeric, text) to authenticated;

-- Voids are the owner's: they take money off a bill.
create or replace function staff_void_folio_charge(p_charge_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge folio_charges%rowtype;
begin
  select * into v_charge from folio_charges where id = p_charge_id;
  if v_charge.id is null or not is_owner_for_property(v_charge.property_id) then
    raise exception 'Only the owner can void a bill line';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Give a reason';
  end if;
  if v_charge.voided_at is not null then
    raise exception 'Already voided';
  end if;
  if exists (select 1 from invoices where reservation_id = v_charge.reservation_id) then
    raise exception 'The bill for this stay is already issued';
  end if;
  update folio_charges set voided_at = now(), void_reason = trim(p_reason), voided_by = auth.uid() where id = p_charge_id;
end;
$$;
revoke all on function staff_void_folio_charge(uuid, text) from public, anon;
grant execute on function staff_void_folio_charge(uuid, text) to authenticated;

create or replace function staff_void_folio_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment folio_payments%rowtype;
begin
  select * into v_payment from folio_payments where id = p_payment_id;
  if v_payment.id is null or not is_owner_for_property(v_payment.property_id) then
    raise exception 'Only the owner can void a payment';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Give a reason';
  end if;
  if v_payment.voided_at is not null then
    raise exception 'Already voided';
  end if;
  if exists (select 1 from invoices where reservation_id = v_payment.reservation_id) then
    raise exception 'The bill for this stay is already issued';
  end if;
  update folio_payments set voided_at = now(), void_reason = trim(p_reason), voided_by = auth.uid() where id = p_payment_id;
end;
$$;
revoke all on function staff_void_folio_payment(uuid, text) from public, anon;
grant execute on function staff_void_folio_payment(uuid, text) to authenticated;

-- A rejected order is voided off the bill, not deleted.
create or replace function staff_reject_order(p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if not is_staff_for_property(v_order.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_order.status <> 'new' then
    raise exception 'Only a new (not yet started) order can be rejected';
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'A reason is required so the guest knows why';
  end if;

  update orders set status = 'rejected', rejection_note = trim(p_note) where id = p_order_id;
  update folio_charges
  set voided_at = now(), void_reason = 'Order rejected: ' || trim(p_note), voided_by = auth.uid()
  where order_id = p_order_id and voided_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Check-out: post the last nights, take what's due, issue the bill
-- ---------------------------------------------------------------------------
create or replace function staff_checkout_reservation(p_reservation_id text, p_payment_method text default 'cash')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res_uuid uuid;
  v_res reservations%rowtype;
  v_room rooms%rowtype;
  v_method text;
  v_balance numeric;
  v_collected numeric := 0;
  v_task_id uuid;
  v_invoice invoices%rowtype;
begin
  v_method := case when p_payment_method in ('cash', 'card', 'upi', 'bank', 'other') then p_payment_method else 'cash' end;

  begin
    v_res_uuid := p_reservation_id::uuid;
  exception when others then
    v_res_uuid := null;
  end;
  if v_res_uuid is not null then
    select * into v_res from reservations where id = v_res_uuid;
  end if;
  if v_res.id is null then
    select * into v_res from reservations
    where room_id = p_reservation_id
    order by (case when status = 'checked_in' then 1 else 2 end), created_at desc
    limit 1;
  end if;

  -- No stay at all: just free the room (as before).
  if v_res.id is null then
    select * into v_room from rooms where id = p_reservation_id;
    if v_room.id is null then
      raise exception 'Reservation or room not found: %', p_reservation_id;
    end if;
    if not is_staff_for_property(v_room.property_id) then
      raise exception 'Not authorized for this property';
    end if;
    update rooms set status = 'dirty' where id = v_room.id;
    return jsonb_build_object('roomId', v_room.id, 'amountCharged', 0, 'paymentMethod', v_method);
  end if;

  if not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;

  if v_res.status = 'checked_out' then
    select * into v_invoice from invoices where reservation_id = v_res.id;
    return jsonb_build_object('reservationId', v_res.id, 'amountCharged', 0, 'paymentMethod', v_method,
                              'invoiceNumber', v_invoice.number, 'shareToken', v_invoice.share_token, 'alreadyCheckedOut', true);
  end if;
  if v_res.status <> 'checked_in' then
    raise exception 'Only a guest who is checked in can be checked out';
  end if;

  select * into v_room from rooms where id = v_res.room_id;

  -- Every night actually stayed: through last night, and at least the first.
  update reservations set status = 'checked_out', checked_out_at = coalesce(checked_out_at, now()) where id = v_res.id;
  perform post_room_nights(v_res.id, greatest(ist_date(v_res.check_in), ist_today() - 1));

  v_balance := (folio_totals(v_res.id)->>'balance')::numeric;
  if v_balance > 0.005 then
    insert into folio_payments (property_id, reservation_id, kind, amount, method, note)
    values (v_res.property_id, v_res.id, 'payment', v_balance, v_method, 'Collected at check-out');
    v_collected := v_balance;
  end if;

  -- The older reports read these.
  update folio_charges
  set settled_at = now(), payment_method = coalesce(payment_method, v_method)
  where reservation_id = v_res.id and settled_at is null and voided_at is null;

  if v_res.room_id is not null then
    update rooms set status = 'dirty' where id = v_res.room_id;
  end if;

  if v_room.number is not null then
    insert into tasks (property_id, room_number, room_label, title, priority, status, category)
    values (v_res.property_id, v_room.number, 'Room ' || v_room.number, 'Deep Clean Room ' || v_room.number, 'high', 'pending', 'housekeeping')
    returning id into v_task_id;
    insert into notifications (property_id, type, title, body, room_number, ref_id)
    values (v_res.property_id, 'task_created', 'Cleaning Required — Room ' || v_room.number,
            'Guest checked out. Room ' || v_room.number || ' is now dirty and needs cleaning.', v_room.number, v_task_id);
  end if;

  v_invoice := issue_invoice(v_res.id);

  return jsonb_build_object(
    'reservationId', v_res.id,
    'amountCharged', v_collected,
    'paymentMethod', v_method,
    'balanceAfter', least(v_balance, 0),
    'invoiceNumber', v_invoice.number,
    'shareToken', v_invoice.share_token
  );
end;
$$;
revoke all on function staff_checkout_reservation(text, text) from public, anon;
grant execute on function staff_checkout_reservation(text, text) to authenticated;

-- Check-out after taking payment in one or more methods; refuses while
-- anything is still due, and all of it rolls back if any part fails.
create or replace function staff_checkout_with_payments(p_reservation_id uuid, p_payments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_p jsonb;
  v_balance numeric;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if v_res.id is null or not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_res.status <> 'checked_in' then
    raise exception 'Only a guest who is checked in can be checked out';
  end if;

  for v_p in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    if coalesce((v_p->>'amount')::numeric, 0) > 0 then
      perform staff_record_folio_payment(p_reservation_id, (v_p->>'amount')::numeric, 'Paid at check-out', v_p->>'method', v_p->>'reference', 'payment');
    end if;
  end loop;

  -- Same nights check-out will post, so the balance checked here is the real one.
  perform post_room_nights(v_res.id, greatest(ist_date(v_res.check_in), ist_today() - 1));
  v_balance := (folio_totals(v_res.id)->>'balance')::numeric;
  if v_balance > 0.005 then
    raise exception 'Still due: % %', (select currency from properties where id = v_res.property_id), round(v_balance, 2);
  end if;

  return staff_checkout_reservation(p_reservation_id::text, 'other');
end;
$$;
revoke all on function staff_checkout_with_payments(uuid, jsonb) from public, anon;
grant execute on function staff_checkout_with_payments(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Booking with an agreed rate
-- ---------------------------------------------------------------------------
drop function if exists staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, integer, timestamptz, text);
create or replace function staff_checkin_new_guest(
  p_property_id text, p_room_id text, p_guest_name text,
  p_guest_phone text default null, p_guest_email text default null, p_guest_vip boolean default false,
  p_id_document_url text default null, p_check_out timestamptz default null, p_party_size integer default 1,
  p_check_in timestamptz default now(), p_source text default 'built_in', p_rate_per_night numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
  v_guest_id uuid;
  v_reservation_id uuid;
  v_check_in timestamptz := coalesce(p_check_in, now());
  v_check_out timestamptz := coalesce(p_check_out, v_check_in + interval '1 day');
  v_is_immediate boolean := v_check_in <= now();
  v_source text := case when p_source in ('built_in', 'imported') then p_source else 'built_in' end;
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_guest_name is null or length(trim(p_guest_name)) = 0 then
    raise exception 'Guest name is required';
  end if;
  if v_check_out <= v_check_in then
    raise exception 'Checkout must be after check-in';
  end if;
  if p_rate_per_night is not null and p_rate_per_night < 0 then
    raise exception 'The rate can''t be negative';
  end if;

  select * into v_room from rooms where id = p_room_id and property_id = p_property_id;
  if not found then
    raise exception 'Room not found on this property';
  end if;
  if v_room.status = 'maintenance' then
    raise exception 'Room % is under maintenance', v_room.number;
  end if;
  if v_is_immediate and v_room.status not in ('ready', 'dirty', 'cleaning') then
    raise exception 'Room % is not available to check in right now (status: %)', v_room.number, v_room.status;
  end if;

  if exists (
    select 1 from reservations res
    where res.room_id = p_room_id
      and res.status in ('upcoming', 'checked_in')
      and res.check_in < v_check_out
      and res.check_out > v_check_in
  ) then
    raise exception 'Room % already has a booking overlapping that date range', v_room.number;
  end if;

  insert into guests (name, email, phone, vip, id_document_url)
  values (trim(p_guest_name), nullif(trim(p_guest_email), ''), nullif(trim(p_guest_phone), ''), coalesce(p_guest_vip, false), nullif(trim(p_id_document_url), ''))
  returning id into v_guest_id;

  insert into reservations (property_id, room_id, guest_id, check_in, check_out, party_size, status, source, rate_per_night)
  values (
    p_property_id, p_room_id, v_guest_id, v_check_in, v_check_out,
    greatest(coalesce(p_party_size, 1), 1),
    case when v_is_immediate then 'checked_in' else 'upcoming' end,
    v_source,
    coalesce(p_rate_per_night, v_room.price_per_night)
  )
  returning id into v_reservation_id;

  if v_is_immediate then
    update rooms set status = case when coalesce(p_guest_vip, false) then 'occupied_vip' else 'occupied' end
      where id = p_room_id;
  end if;

  return v_reservation_id;
end;
$$;
revoke all on function staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, integer, timestamptz, text, numeric) from public, anon;
grant execute on function staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, integer, timestamptz, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Owner: billing settings
-- ---------------------------------------------------------------------------
create or replace function owner_update_billing_settings(p_property_id text, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only the property owner can change billing settings';
  end if;
  if coalesce((p_settings->>'gstEnabled')::boolean, false) and nullif(upper(trim(p_settings->>'gstin')), '') is null then
    raise exception 'Enter your GSTIN to turn GST on';
  end if;
  if nullif(upper(trim(p_settings->>'gstin')), '') !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'That GSTIN doesn''t look right: it''s 15 characters, like 02ABCDE1234F1Z5';
  end if;
  if nullif(upper(trim(p_settings->>'invoicePrefix')), '') !~ '^[A-Z0-9]{1,5}$' then
    raise exception 'The bill prefix can be up to 5 letters or numbers';
  end if;
  update properties set
    legal_name = nullif(trim(p_settings->>'legalName'), ''),
    billing_address = nullif(trim(p_settings->>'address'), ''),
    billing_phone = nullif(trim(p_settings->>'phone'), ''),
    billing_email = nullif(trim(p_settings->>'email'), ''),
    gstin = nullif(upper(trim(p_settings->>'gstin')), ''),
    gst_enabled = coalesce((p_settings->>'gstEnabled')::boolean, false),
    gst_room_low_rate = coalesce((p_settings->>'roomLowRate')::numeric, gst_room_low_rate),
    gst_room_high_rate = coalesce((p_settings->>'roomHighRate')::numeric, gst_room_high_rate),
    gst_room_threshold = coalesce((p_settings->>'roomThreshold')::numeric, gst_room_threshold),
    gst_food_rate = coalesce((p_settings->>'foodRate')::numeric, gst_food_rate),
    gst_other_rate = coalesce((p_settings->>'otherRate')::numeric, gst_other_rate),
    invoice_prefix = coalesce(nullif(upper(trim(p_settings->>'invoicePrefix')), ''), invoice_prefix)
  where id = p_property_id;
end;
$$;
revoke all on function owner_update_billing_settings(text, jsonb) from public, anon;
grant execute on function owner_update_billing_settings(text, jsonb) to authenticated;
