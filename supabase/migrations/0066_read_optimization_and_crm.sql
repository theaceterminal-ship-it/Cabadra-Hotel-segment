-- Migration 0066: Read Optimization, Guest CRM Directory, and Sales Reports
-- Provides efficient RPCs for Guest CRM directory and itemized Sales/Revenue Reports.

-- 1. Guest CRM & Stay History Directory RPC
create or replace function staff_fetch_guest_crm(
  p_property_id text,
  p_search text default null,
  p_status text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text;
  v_result jsonb;
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;

  v_search := nullif(trim(p_search), '');

  select coalesce(jsonb_agg(jsonb_build_object(
    'reservationId', r.id,
    'guestName', coalesce(g.name, 'Guest'),
    'guestPhone', coalesce(g.phone, ''),
    'guestEmail', coalesce(g.email, ''),
    'guestIdDocumentUrl', g.id_document_url,
    'vip', coalesce(g.vip, false),
    'roomNumber', coalesce(rm.number, '?'),
    'roomType', coalesce(rm.type, 'Standard'),
    'checkIn', r.check_in,
    'checkOut', r.check_out,
    'checkedOutAt', r.checked_out_at,
    'status', r.status,
    'guestToken', r.guest_token,
    'totalSpend', (
      select coalesce(sum(fc.amount), 0)
      from folio_charges fc
      where fc.reservation_id = r.id
    )
  ) order by r.check_in desc), '[]'::jsonb)
  into v_result
  from reservations r
  left join guests g on g.id = r.guest_id
  left join rooms rm on rm.id = r.room_id
  where r.property_id = p_property_id
    and (p_status is null or p_status = 'all' or r.status = p_status)
    and (p_start_date is null or r.check_in::date >= p_start_date)
    and (p_end_date is null or r.check_in::date <= p_end_date)
    and (
      v_search is null
      or g.name ilike '%' || v_search || '%'
      or g.phone ilike '%' || v_search || '%'
      or g.email ilike '%' || v_search || '%'
      or rm.number ilike '%' || v_search || '%'
    );

  return v_result;
end;
$$;

revoke execute on function staff_fetch_guest_crm(text, text, text, date, date) from public;
grant execute on function staff_fetch_guest_crm(text, text, text, date, date) to authenticated, anon;

-- 2. Sales & Revenue Reports RPC
create or replace function staff_fetch_sales_report(
  p_property_id text,
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_room_sales numeric(10, 2);
  v_dining_sales numeric(10, 2);
  v_experience_sales numeric(10, 2);
  v_other_sales numeric(10, 2);
  v_total_sales numeric(10, 2);
  v_cash_sales numeric(10, 2);
  v_card_sales numeric(10, 2);
  v_upi_sales numeric(10, 2);
  v_checkins_count int;
  v_completed_orders_count int;
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;

  v_start := coalesce(p_start_date, CURRENT_DATE);
  v_end := coalesce(p_end_date, CURRENT_DATE);

  -- Room Night Sales (Calculated from reservations)
  select coalesce(sum(rm.price_per_night), 0)
  into v_room_sales
  from reservations r
  join rooms rm on rm.id = r.room_id
  where r.property_id = p_property_id
    and r.status in ('checked_in', 'checked_out')
    and r.check_in::date >= v_start
    and r.check_in::date <= v_end;

  -- Room Service Dining Sales (from folio_charges room_service category)
  select coalesce(sum(amount), 0)
  into v_dining_sales
  from folio_charges
  where property_id = p_property_id
    and category = 'room_service'
    and posted_at::date >= v_start
    and posted_at::date <= v_end;

  -- Experience Sales (from experience_bookings or folio_charges other category)
  select coalesce(sum(price), 0)
  into v_experience_sales
  from experience_bookings
  where property_id = p_property_id
    and status in ('confirmed', 'completed')
    and created_at::date >= v_start
    and created_at::date <= v_end;

  -- Other Extra Service Charges
  select coalesce(sum(amount), 0)
  into v_other_sales
  from folio_charges
  where property_id = p_property_id
    and category in ('spa', 'laundry', 'minibar', 'other')
    and order_id is null
    and posted_at::date >= v_start
    and posted_at::date <= v_end;

  v_total_sales := v_room_sales + v_dining_sales + v_experience_sales + v_other_sales;

  -- Payment Method Breakdown (from settled folio_charges)
  select
    coalesce(sum(case when payment_method = 'cash' then amount else 0 end), 0),
    coalesce(sum(case when payment_method = 'card' then amount else 0 end), 0),
    coalesce(sum(case when payment_method = 'upi' then amount else 0 end), 0)
  into v_cash_sales, v_card_sales, v_upi_sales
  from folio_charges
  where property_id = p_property_id
    and settled_at is not null
    and settled_at::date >= v_start
    and settled_at::date <= v_end;

  -- Activity Counts
  select count(*) into v_checkins_count
  from reservations
  where property_id = p_property_id
    and status in ('checked_in', 'checked_out')
    and check_in::date >= v_start
    and check_in::date <= v_end;

  select count(*) into v_completed_orders_count
  from orders
  where property_id = p_property_id
    and status in ('delivered', 'ready')
    and created_at::date >= v_start
    and created_at::date <= v_end;

  return jsonb_build_object(
    'startDate', v_start,
    'endDate', v_end,
    'roomSales', v_room_sales,
    'diningSales', v_dining_sales,
    'experienceSales', v_experience_sales,
    'otherSales', v_other_sales,
    'totalSales', v_total_sales,
    'cashSales', v_cash_sales,
    'cardSales', v_card_sales,
    'upiSales', v_upi_sales,
    'checkinsCount', v_checkins_count,
    'completedOrdersCount', v_completed_orders_count
  );
end;
$$;

revoke execute on function staff_fetch_sales_report(text, date, date) from public;
grant execute on function staff_fetch_sales_report(text, date, date) to authenticated, anon;
