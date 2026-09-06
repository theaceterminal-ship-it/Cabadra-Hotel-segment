-- Replaces the app's remaining local-only mock state with real tables:
-- guest requests (urgent/concierge tickets), housekeeping/maintenance
-- tasks, curated-experience bookings, owner property stats, and
-- owner-driven property creation. Apply after 0001_init.sql and
-- 0002_room_ops.sql.

-- ============================================================================
-- GUEST REQUESTS — Reception's "Urgent Requests" card + the concierge modal
-- ============================================================================

create table guest_requests (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  reservation_id uuid references reservations(id) on delete set null,
  room_number text not null,
  title text not null,
  priority text not null default 'Standard' check (priority in ('High Priority', 'Standard', 'Pending Approval')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table guest_requests enable row level security;

create policy "staff can manage guest requests on their property" on guest_requests
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create index idx_guest_requests_property on guest_requests(property_id);

-- Guests submit through this — never a direct table grant. Reuses the same
-- token pattern as guest_place_order(). Reception can also log a request
-- directly (an `insert` under their own RLS policy above), for a
-- phone-in/walk-up ask that didn't come through the guest app.
create or replace function guest_submit_request(p_token uuid, p_title text, p_priority text default 'Standard')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_room_number text;
  v_id uuid;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Request needs a title';
  end if;

  select number into v_room_number from rooms where id = v_reservation.room_id;

  insert into guest_requests (property_id, reservation_id, room_number, title, priority)
  values (v_reservation.property_id, v_reservation.id, coalesce(v_room_number, '?'), p_title, coalesce(p_priority, 'Standard'))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function guest_submit_request(uuid, text, text) to anon;

-- ============================================================================
-- TASKS — Live Ops housekeeping/maintenance board
-- ============================================================================

create table tasks (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  room_label text not null default '',
  title text not null,
  description text not null default '',
  priority text not null default 'standard' check (priority in ('high', 'standard')),
  due_label text not null default '',
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  category text not null check (category in ('housekeeping', 'maintenance', 'amenities', 'concierge')),
  assigned_to text,
  created_at timestamptz not null default now()
);

alter table tasks enable row level security;

create policy "staff can manage tasks on their property" on tasks
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create index idx_tasks_property on tasks(property_id);

-- ============================================================================
-- CURATED EXPERIENCE BOOKINGS — guest "Reserve Now" actions
-- ============================================================================

create table experience_bookings (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  experience_name text not null,
  price numeric(10, 2) not null default 0,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table experience_bookings enable row level security;

create policy "staff can view experience bookings on their property" on experience_bookings
  for select using (is_staff_for_property(property_id));

create index idx_experience_bookings_property on experience_bookings(property_id);

create or replace function guest_book_experience(p_token uuid, p_experience_name text, p_price numeric default 0)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_id uuid;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  insert into experience_bookings (property_id, reservation_id, experience_name, price)
  values (v_reservation.property_id, v_reservation.id, p_experience_name, p_price)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function guest_book_experience(uuid, text, numeric) to anon;

-- ============================================================================
-- OWNER: real property stats + owner-driven property creation
-- ============================================================================

-- Everything the owner dashboard's KPI cards need, computed from real rows
-- instead of static demo numbers. SECURITY INVOKER (default) — RLS on
-- rooms/orders already scopes this to properties the caller is staff on.
create or replace function staff_property_stats(p_property_id text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'totalRooms', (select count(*) from rooms where property_id = p_property_id),
    'occupiedRooms', (select count(*) from rooms where property_id = p_property_id and status in ('occupied', 'occupied_vip')),
    'ordersToday', (select count(*) from orders where property_id = p_property_id and created_at >= date_trunc('day', now())),
    'revenueToday', (select coalesce(sum(total_amount), 0) from orders where property_id = p_property_id and created_at >= date_trunc('day', now())),
    'totalRevenue', (select coalesce(sum(total_amount), 0) from orders where property_id = p_property_id),
    'avgOrderValue', (select coalesce(round(avg(total_amount), 2), 0) from orders where property_id = p_property_id),
    'openRequests', (select count(*) from guest_requests where property_id = p_property_id and status = 'open')
  );
$$;

revoke execute on function staff_property_stats(text) from public;
grant execute on function staff_property_stats(text) to authenticated;

-- Same idea, summed across a whole portfolio — the owner dashboard's KPI
-- row and executive report use this instead of fetching each property's
-- stats and adding formatted strings back together client-side.
create or replace function staff_portfolio_stats(p_property_ids text[])
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'totalRooms', (select count(*) from rooms where property_id = any(p_property_ids)),
    'occupiedRooms', (select count(*) from rooms where property_id = any(p_property_ids) and status in ('occupied', 'occupied_vip')),
    'ordersToday', (select count(*) from orders where property_id = any(p_property_ids) and created_at >= date_trunc('day', now())),
    'totalRevenue', (select coalesce(sum(total_amount), 0) from orders where property_id = any(p_property_ids)),
    'avgOrderValue', (select coalesce(round(avg(total_amount), 2), 0) from orders where property_id = any(p_property_ids)),
    'openRequests', (select count(*) from guest_requests where property_id = any(p_property_ids) and status = 'open')
  );
$$;

revoke execute on function staff_portfolio_stats(text[]) from public;
grant execute on function staff_portfolio_stats(text[]) to authenticated;

-- Revenue/orders per day for the last p_days days — real, so a fresh
-- project correctly shows a mostly-flat line instead of a fabricated curve.
-- Backs the owner dashboard's 7d/30d/90d selector directly (no separate
-- fake data per range — same query, different window).
create or replace function staff_revenue_trend(p_property_id text, p_days int default 7)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'revenue', revenue, 'orders', orders) order by day), '[]'::jsonb)
  from (
    select
      to_char(d, 'Mon DD') as day,
      coalesce(sum(o.total_amount), 0) as revenue,
      count(o.id) as orders
    from generate_series(date_trunc('day', now()) - make_interval(days => greatest(p_days, 1) - 1), date_trunc('day', now()), interval '1 day') as d
    left join orders o on o.property_id = p_property_id and date_trunc('day', o.created_at) = d
    group by d
    order by d
  ) t;
$$;

revoke execute on function staff_revenue_trend(text, int) from public;
grant execute on function staff_revenue_trend(text, int) to authenticated;

-- Creating a property and granting yourself owner access on it are two
-- inserts that must happen together — a caller has no staff_properties row
-- for a property that doesn't exist yet, so this runs as SECURITY DEFINER
-- rather than needing a broad (and much harder to reason about) INSERT
-- policy on `properties` itself.
create or replace function staff_create_property(p_id text, p_name text, p_location text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;
  insert into properties (id, name, location, status) values (p_id, p_name, p_location, 'active');
  insert into staff_properties (user_id, property_id, role) values (auth.uid(), p_id, 'owner');
end;
$$;

revoke execute on function staff_create_property(text, text, text) from public;
grant execute on function staff_create_property(text, text, text) to authenticated;
