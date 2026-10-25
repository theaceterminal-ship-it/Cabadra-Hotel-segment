-- Standalone PMS, phase 3: running the day, and the numbers.
--
--   * Day close: what the desk collected on a day, by method (cash, UPI,
--     card, bank, other; refunds netted), the money it posted by category,
--     and a close: the cash actually counted against the cash expected,
--     with the difference and a note. A closed day is a record, never
--     edited or deleted, and the owner sees every one in Reports.
--   * Reports for a date range: occupancy, room nights sold, average rate
--     (ADR), revenue per available room (RevPAR), revenue by category, GST
--     by rate (CGST/SGST), payments by method, bookings by channel,
--     cancellations and no-shows, average stay, with a row per day.
--   * The guest register (the register Indian hotels keep for the police):
--     every arrival with nationality, address and ID, and foreign guests
--     flagged for Form C. Guests gain those four fields.
-- Apply after 0001-0080.

-- ---------------------------------------------------------------------------
-- Guest register fields
-- ---------------------------------------------------------------------------
alter table guests
  add column if not exists address text,
  add column if not exists nationality text,
  add column if not exists id_type text,
  add column if not exists id_number text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'guests_register_fields') then
    alter table guests add constraint guests_register_fields check (
      length(address) <= 300 and length(nationality) <= 60 and length(id_number) <= 40
      and (id_type is null or id_type in ('aadhaar', 'passport', 'driving_licence', 'voter_id', 'pan', 'other'))
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Day close
-- ---------------------------------------------------------------------------
create table if not exists day_closes (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  business_date date not null,
  -- {cash, upi, card, bank, other, total}: net of refunds, as the books said at close.
  expected jsonb not null,
  counted_cash numeric(10, 2) not null check (counted_cash >= 0),
  cash_difference numeric(10, 2) not null,
  note text check (length(note) <= 500),
  closed_at timestamptz not null default now(),
  closed_by uuid default auth.uid(),
  unique (property_id, business_date)
);
alter table day_closes enable row level security;
revoke all on day_closes from anon;
drop policy if exists day_closes_staff_read on day_closes;
create policy day_closes_staff_read on day_closes for select to authenticated using (is_staff_for_property(property_id));

create or replace function day_closes_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception 'A closed day is a record and can''t be changed or deleted';
end;
$$;
drop trigger if exists day_closes_guard on day_closes;
create trigger day_closes_guard before update or delete on day_closes
for each row execute function day_closes_guard();

-- Net money received on one Indian day, by method.
create or replace function day_collections(p_property_id text, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select method,
           sum(case when kind = 'payment' then amount else -amount end) as net
    from folio_payments
    where property_id = p_property_id and voided_at is null and ist_date(received_at) = p_date
    group by method
  )
  select jsonb_build_object(
    'cash', coalesce((select net from m where method = 'cash'), 0),
    'upi', coalesce((select net from m where method = 'upi'), 0),
    'card', coalesce((select net from m where method = 'card'), 0),
    'bank', coalesce((select net from m where method = 'bank'), 0),
    'other', coalesce((select net from m where method = 'other'), 0),
    'total', coalesce((select sum(net) from m), 0)
  );
$$;
revoke all on function day_collections(text, date) from public, anon, authenticated;

create or replace function staff_day_summary(p_property_id text, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_close day_closes%rowtype;
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  select * into v_close from day_closes where property_id = p_property_id and business_date = p_date;

  return jsonb_build_object(
    'date', p_date,
    'collections', day_collections(p_property_id, p_date),
    'entries', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'at', p.received_at, 'kind', p.kind, 'method', p.method, 'amount', p.amount,
        'reference', p.reference, 'note', p.note, 'voided', p.voided_at is not null,
        'guest', g.name, 'room', rm.number, 'ref', r.booking_ref, 'reservationId', r.id,
        'by', u.email
      ) order by p.received_at), '[]'::jsonb)
      from folio_payments p
      join reservations r on r.id = p.reservation_id
      left join guests g on g.id = r.guest_id
      left join rooms rm on rm.id = r.room_id
      left join auth.users u on u.id = p.received_by
      where p.property_id = p_property_id and ist_date(p.received_at) = p_date
    ),
    'posted', (
      select coalesce(jsonb_object_agg(category, total), '{}'::jsonb)
      from (
        select category, sum(amount + tax_amount) as total
        from folio_charges
        where property_id = p_property_id and voided_at is null and category <> 'deposit'
          and coalesce(stay_date, ist_date(posted_at)) = p_date
        group by category
      ) x
    ),
    'arrivals', (select count(*) from reservations where property_id = p_property_id and status in ('checked_in', 'checked_out') and ist_date(check_in) = p_date),
    'departures', (select count(*) from reservations where property_id = p_property_id and status = 'checked_out' and ist_date(checked_out_at) = p_date),
    'inHouse', (select count(*) from reservations where property_id = p_property_id and status = 'checked_in'),
    'close', case when v_close.id is null then null else jsonb_build_object(
      'closedAt', v_close.closed_at, 'closedBy', (select email from auth.users where id = v_close.closed_by),
      'expected', v_close.expected, 'countedCash', v_close.counted_cash, 'cashDifference', v_close.cash_difference, 'note', v_close.note
    ) end
  );
end;
$$;
revoke all on function staff_day_summary(text, date) from public, anon;
grant execute on function staff_day_summary(text, date) to authenticated;

create or replace function staff_close_day(p_property_id text, p_date date, p_counted_cash numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected jsonb;
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_date > ist_today() then
    raise exception 'That day hasn''t happened yet';
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'Enter the cash you counted';
  end if;
  if exists (select 1 from day_closes where property_id = p_property_id and business_date = p_date) then
    raise exception 'That day is already closed';
  end if;
  v_expected := day_collections(p_property_id, p_date);
  insert into day_closes (property_id, business_date, expected, counted_cash, cash_difference, note)
  values (p_property_id, p_date, v_expected, round(p_counted_cash, 2),
          round(p_counted_cash - (v_expected->>'cash')::numeric, 2), nullif(trim(p_note), ''));
  return staff_day_summary(p_property_id, p_date);
end;
$$;
revoke all on function staff_close_day(text, date, numeric, text) from public, anon;
grant execute on function staff_close_day(text, date, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reports for a range
-- ---------------------------------------------------------------------------
create or replace function staff_report(p_property_id text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rooms integer;
  v_days integer := p_to - p_from + 1;
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_to < p_from or v_days > 366 then
    raise exception 'Pick a range of up to a year';
  end if;
  select count(*) into v_rooms from rooms where property_id = p_property_id;

  return (
    with days as (
      select d::date as day from generate_series(p_from, p_to, interval '1 day') d
    ),
    stays as (
      -- Each stay's nights, ending the day it actually left.
      select r.id, ist_date(r.check_in) as first_night,
             greatest(ist_date(case when r.status = 'checked_out' then coalesce(r.checked_out_at, r.check_out) else greatest(r.check_out, now()) end), ist_date(r.check_in) + 1) as leaves
      from reservations r
      where r.property_id = p_property_id and r.status in ('checked_in', 'checked_out')
    ),
    occ as (
      select d.day, count(s.id) as occupied
      from days d left join stays s on s.first_night <= d.day and s.leaves > d.day
      group by d.day
    ),
    room_rev as (
      select coalesce(stay_date, ist_date(posted_at)) as day, sum(amount) as revenue
      from folio_charges
      where property_id = p_property_id and voided_at is null and category = 'room'
        and coalesce(stay_date, ist_date(posted_at)) between p_from and p_to
      group by 1
    ),
    charges as (
      select category, sum(amount) as amount, sum(tax_amount) as tax
      from folio_charges
      where property_id = p_property_id and voided_at is null and category <> 'deposit'
        and coalesce(stay_date, ist_date(posted_at)) between p_from and p_to
      group by category
    ),
    daily as (
      select o.day, o.occupied, coalesce(rr.revenue, 0) as room_revenue
      from occ o left join room_rev rr on rr.day = o.day
    ),
    totals as (
      select sum(occupied) as nights, sum(room_revenue) as room_revenue from daily
    )
    select jsonb_build_object(
      'from', p_from, 'to', p_to, 'days', v_days, 'rooms', v_rooms,
      'roomNightsAvailable', v_rooms * v_days,
      'roomNightsSold', t.nights,
      'occupancy', case when v_rooms * v_days > 0 then round(100.0 * t.nights / (v_rooms * v_days), 1) else 0 end,
      'roomRevenue', t.room_revenue,
      'adr', case when t.nights > 0 then round(t.room_revenue / t.nights, 2) else 0 end,
      'revpar', case when v_rooms * v_days > 0 then round(t.room_revenue / (v_rooms * v_days), 2) else 0 end,
      'revenueByCategory', (select coalesce(jsonb_object_agg(category, amount), '{}'::jsonb) from charges),
      'revenueTotal', (select coalesce(sum(amount), 0) from charges),
      'taxTotal', (select coalesce(sum(tax), 0) from charges),
      'taxByRate', (
        select coalesce(jsonb_agg(jsonb_build_object('rate', tax_rate, 'taxable', taxable, 'tax', tax, 'cgst', round(tax / 2, 2), 'sgst', tax - round(tax / 2, 2)) order by tax_rate), '[]'::jsonb)
        from (
          select tax_rate, sum(amount) as taxable, sum(tax_amount) as tax
          from folio_charges
          where property_id = p_property_id and voided_at is null and tax_rate > 0
            and coalesce(stay_date, ist_date(posted_at)) between p_from and p_to
          group by tax_rate
        ) x
      ),
      'payments', (
        select jsonb_build_object(
          'cash', coalesce(sum(net) filter (where method = 'cash'), 0),
          'upi', coalesce(sum(net) filter (where method = 'upi'), 0),
          'card', coalesce(sum(net) filter (where method = 'card'), 0),
          'bank', coalesce(sum(net) filter (where method = 'bank'), 0),
          'other', coalesce(sum(net) filter (where method = 'other'), 0),
          'total', coalesce(sum(net), 0),
          'refunds', coalesce(sum(-net) filter (where net < 0), 0)
        )
        from (
          select method, case when kind = 'payment' then amount else -amount end as net
          from folio_payments
          where property_id = p_property_id and voided_at is null and ist_date(received_at) between p_from and p_to
        ) x
      ),
      'bookingsByChannel', (
        select coalesce(jsonb_object_agg(channel, n), '{}'::jsonb)
        from (select channel, count(*) n from reservations where property_id = p_property_id and ist_date(created_at) between p_from and p_to group by channel) x
      ),
      'bookingsMade', (select count(*) from reservations where property_id = p_property_id and ist_date(created_at) between p_from and p_to),
      'arrivals', (select count(*) from reservations where property_id = p_property_id and status in ('checked_in', 'checked_out') and ist_date(check_in) between p_from and p_to),
      'cancellations', (select count(*) from reservations where property_id = p_property_id and status = 'cancelled' and ist_date(cancelled_at) between p_from and p_to),
      'noShows', (select count(*) from reservations where property_id = p_property_id and status = 'no_show' and ist_date(cancelled_at) between p_from and p_to),
      'averageStay', (
        select coalesce(round(avg(s.leaves - s.first_night), 1), 0)
        from stays s join reservations r on r.id = s.id
        where r.status = 'checked_out' and ist_date(r.checked_out_at) between p_from and p_to
      ),
      'daily', (
        select jsonb_agg(jsonb_build_object(
          'date', day, 'occupied', occupied, 'roomRevenue', room_revenue,
          'occupancy', case when v_rooms > 0 then round(100.0 * occupied / v_rooms, 1) else 0 end
        ) order by day)
        from daily
      ),
      'dayCloses', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'date', business_date, 'expected', expected, 'countedCash', counted_cash, 'cashDifference', cash_difference,
          'note', note, 'closedAt', closed_at, 'closedBy', (select email from auth.users where id = closed_by)
        ) order by business_date desc), '[]'::jsonb)
        from day_closes where property_id = p_property_id and business_date between p_from and p_to
      )
    )
    from totals t
  );
end;
$$;
revoke all on function staff_report(text, date, date) from public, anon;
grant execute on function staff_report(text, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Guest register
-- ---------------------------------------------------------------------------
create or replace function staff_guest_register(p_property_id text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Pick a range of up to a year';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'reservationId', r.id, 'ref', r.booking_ref, 'status', r.status,
      'arrived', r.check_in, 'left', case when r.status = 'checked_out' then r.checked_out_at end, 'expectedDeparture', r.check_out,
      'room', rm.number, 'guests', r.party_size,
      'name', g.name, 'phone', g.phone, 'email', g.email, 'address', g.address,
      'nationality', g.nationality, 'idType', g.id_type, 'idNumber', g.id_number,
      'idPhotoOnFile', g.id_document_url is not null and g.id_document_purged_at is null,
      'foreign', g.nationality is not null and lower(trim(g.nationality)) not in ('india', 'indian', 'in', 'bharat')
    ) order by r.check_in), '[]'::jsonb)
    from reservations r
    left join guests g on g.id = r.guest_id
    left join rooms rm on rm.id = r.room_id
    where r.property_id = p_property_id
      and r.status in ('checked_in', 'checked_out')
      and ist_date(r.check_in) between p_from and p_to
  );
end;
$$;
revoke all on function staff_guest_register(text, date, date) from public, anon;
grant execute on function staff_guest_register(text, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Booking edits can now fill in the register fields too
-- ---------------------------------------------------------------------------
create or replace function staff_update_guest_register(p_reservation_id uuid, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if v_res.id is null or not is_staff_for_property(v_res.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_details ? 'idType' and nullif(p_details->>'idType', '') is not null
     and (p_details->>'idType') not in ('aadhaar', 'passport', 'driving_licence', 'voter_id', 'pan', 'other') then
    raise exception 'Unknown ID type';
  end if;
  update guests set
    address = case when p_details ? 'address' then nullif(trim(p_details->>'address'), '') else address end,
    nationality = case when p_details ? 'nationality' then nullif(trim(p_details->>'nationality'), '') else nationality end,
    id_type = case when p_details ? 'idType' then nullif(p_details->>'idType', '') else id_type end,
    id_number = case when p_details ? 'idNumber' then nullif(upper(trim(p_details->>'idNumber')), '') else id_number end
  where id = v_res.guest_id;
end;
$$;
revoke all on function staff_update_guest_register(uuid, jsonb) from public, anon;
grant execute on function staff_update_guest_register(uuid, jsonb) to authenticated;

-- booking_json carries the register fields, so the booking panel can show and edit them.
create or replace function booking_json(p_reservation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id, 'ref', r.booking_ref, 'status', r.status, 'source', r.source,
    'roomId', r.room_id, 'roomNumber', rm.number, 'roomType', rm.type,
    'guest', jsonb_build_object(
      'id', g.id, 'name', g.name, 'phone', g.phone, 'email', g.email, 'vip', g.vip,
      'address', g.address, 'nationality', g.nationality, 'idType', g.id_type, 'idNumber', g.id_number
    ),
    'checkIn', r.check_in, 'checkOut', r.check_out,
    -- A guest who has left is shown leaving the day they actually left (early or late).
    'checkInDate', ist_date(r.check_in), 'checkOutDate', d.out_date,
    'nights', d.out_date - ist_date(r.check_in),
    'partySize', r.party_size, 'ratePerNight', r.rate_per_night,
    'channel', r.channel, 'channelDetail', r.channel_detail, 'notes', r.notes,
    'createdAt', r.created_at, 'checkedOutAt', r.checked_out_at,
    'cancelledAt', r.cancelled_at, 'cancelReason', r.cancel_reason,
    'totals', folio_totals(r.id),
    'invoiceNumber', (select number from invoices i where i.reservation_id = r.id)
  )
  from reservations r
  left join rooms rm on rm.id = r.room_id
  left join guests g on g.id = r.guest_id
  cross join lateral (
    select greatest(
      ist_date(case when r.status = 'checked_out' then coalesce(r.checked_out_at, r.check_out) else r.check_out end),
      ist_date(r.check_in) + 1
    ) as out_date
  ) d
  where r.id = p_reservation_id;
$$;
revoke all on function booking_json(uuid) from public, anon, authenticated;
