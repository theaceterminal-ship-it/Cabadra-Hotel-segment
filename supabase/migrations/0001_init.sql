-- Cabadra: initial Supabase schema.
--
-- Design in one paragraph: owners and receptionists are real Supabase Auth
-- users, scoped to properties via staff_properties and governed by Row
-- Level Security. Guests are NOT Supabase Auth users — a reservation
-- carries a random guest_token (the capability embedded in the QR/link
-- handed to them at check-in), and every guest-facing action goes through a
-- SECURITY DEFINER RPC function that checks the token itself, not RLS. This
-- means anon (the public API key) has zero direct table access — everything
-- it can do is exactly what the guest_* functions below allow, nothing more.
--
-- Apply this in the Supabase SQL Editor (or `supabase db push` once you have
-- the CLI linked to your project). Safe to run once on a fresh project.

-- ============================================================================
-- STAFF & PROPERTIES
-- ============================================================================

create table properties (
  id text primary key,
  name text not null,
  location text not null,
  status text not null default 'active' check (status in ('active', 'maintenance', 'paused')),
  created_at timestamptz not null default now()
);

-- Which Supabase Auth user can act as staff on which property, and as what
-- role. An owner has one row per property they run; a receptionist has one
-- row for their assigned property. This table is the entire authorization
-- model — every RLS policy below reduces to "is there a row here."
create table staff_properties (
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id text not null references properties(id) on delete cascade,
  role text not null check (role in ('owner', 'receptionist')),
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

create or replace function is_staff_for_property(p_property_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from staff_properties
    where user_id = auth.uid() and property_id = p_property_id
  );
$$;

create or replace function is_owner_for_property(p_property_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from staff_properties
    where user_id = auth.uid() and property_id = p_property_id and role = 'owner'
  );
$$;

-- ============================================================================
-- ROOMS, GUESTS, RESERVATIONS
-- ============================================================================

create table rooms (
  id text primary key,
  property_id text not null references properties(id) on delete cascade,
  number text not null,
  type text not null,
  floor integer not null,
  status text not null default 'ready'
    check (status in ('ready', 'occupied', 'cleaning', 'dirty', 'occupied_vip', 'maintenance')),
  price_per_night numeric(10, 2) not null
);

create table guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  vip boolean not null default false
);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  room_id text not null references rooms(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  check_in timestamptz not null,
  check_out timestamptz not null,
  party_size integer not null default 1,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'checked_in', 'checked_out', 'cancelled')),
  source text not null default 'built_in',
  -- The capability token: this, not a login, is what proves "this browser
  -- represents this guest's stay." Never expose reservations.id-based
  -- lookups to anon — always go through guest_token.
  guest_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- MENU, ORDERS, FOLIO
-- ============================================================================

-- Per-property, not global — different hotels serve different food. Seed
-- data below copies the same catalog into both demo properties, but a real
-- onboarding flow would let each hotel define its own.
create table menu_items (
  id text not null,
  property_id text not null references properties(id) on delete cascade,
  name text not null,
  category text not null,
  price numeric(10, 2) not null,
  description text not null default '',
  image text not null default '',
  is_veg boolean not null default true,
  tags text[] not null default '{}',
  prep_time text,
  primary key (id, property_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  room_id text not null references rooms(id),
  -- OrderLineItem[]: [{menuItemId, name, price, quantity, fromRecommendation?}]
  items jsonb not null,
  total_amount numeric(10, 2) not null,
  status text not null default 'new' check (status in ('new', 'preparing', 'ready', 'delivered')),
  created_at timestamptz not null default now()
);

create table folio_charges (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  description text not null,
  amount numeric(10, 2) not null,
  category text not null default 'room_service'
    check (category in ('room_service', 'spa', 'laundry', 'minibar', 'other')),
  posted_at timestamptz not null default now()
);

create index idx_rooms_property on rooms(property_id);
create index idx_reservations_property on reservations(property_id);
create index idx_orders_property on orders(property_id);
create index idx_orders_reservation on orders(reservation_id);
create index idx_folio_reservation on folio_charges(reservation_id);
create index idx_menu_items_property on menu_items(property_id);

-- ============================================================================
-- ROW LEVEL SECURITY — staff (owner + receptionist) access
-- ============================================================================

alter table properties enable row level security;
alter table staff_properties enable row level security;
alter table rooms enable row level security;
alter table guests enable row level security;
alter table reservations enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table folio_charges enable row level security;

create policy "staff can view their properties" on properties
  for select using (is_staff_for_property(id));

create policy "staff can view their own staff_properties rows" on staff_properties
  for select using (user_id = auth.uid());

create policy "staff can manage rooms on their property" on rooms
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create policy "staff can manage reservations on their property" on reservations
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

-- Guests aren't property-scoped by themselves; reachable only via a
-- reservation staff can already see.
create policy "staff can view guests tied to their properties" on guests
  for select using (
    exists (
      select 1 from reservations r
      where r.guest_id = guests.id and is_staff_for_property(r.property_id)
    )
  );

create policy "staff can manage menu on their property" on menu_items
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create policy "staff can manage orders on their property" on orders
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create policy "staff can view folio charges on their property" on folio_charges
  for select using (is_staff_for_property(property_id));

-- Deliberately no policies granting anon anything on these tables — RLS
-- defaults to deny, so anon's entire surface is the functions below.

-- The owner dashboard's proof-point metric: does an order with a
-- recommended item actually run bigger than one without? Same shape as the
-- old Express prototype's GET /analytics/ticket-size. RLS on `orders`
-- already restricts a caller to properties they're staff on; this function
-- just aggregates what `select` would already return them.
create or replace function staff_ticket_size_analytics(p_property_id text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'ordersTotal', count(*),
    'avgOrderValueWithRecommendation', coalesce(
      round(avg(total_amount) filter (
        where exists (select 1 from jsonb_array_elements(items) i where (i->>'fromRecommendation')::boolean)
      ), 2), 0),
    'avgOrderValueWithoutRecommendation', coalesce(
      round(avg(total_amount) filter (
        where not exists (select 1 from jsonb_array_elements(items) i where (i->>'fromRecommendation')::boolean)
      ), 2), 0)
  )
  from orders
  where property_id = p_property_id;
$$;

-- ============================================================================
-- GUEST ACCESS — token-scoped SECURITY DEFINER functions, callable by anon
-- ============================================================================

-- Everything the guest page needs on load: their reservation, room, property
-- name, and that property's menu. One round trip.
create or replace function guest_get_context(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_result jsonb;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  select jsonb_build_object(
    'reservationId', v_reservation.id,
    'partySize', v_reservation.party_size,
    'property', jsonb_build_object('id', p.id, 'name', p.name),
    'room', jsonb_build_object('id', rm.id, 'number', rm.number, 'type', rm.type),
    'menu', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'category', m.category, 'price', m.price,
        'description', m.description, 'image', m.image, 'isVeg', m.is_veg,
        'tags', m.tags, 'prepTime', m.prep_time
      )), '[]'::jsonb)
      from menu_items m where m.property_id = v_reservation.property_id
    )
  )
  into v_result
  from properties p, rooms rm
  where p.id = v_reservation.property_id and rm.id = v_reservation.room_id;

  return v_result;
end;
$$;

-- Rule-based recommendations, scoped to this one reservation via its token.
-- Same rules as the original Express prototype (server/recommendations.ts):
-- day-part category match, reorder boost for items delivered earlier this
-- stay (excluding whatever's still active/undelivered), party-size and VIP
-- boosts, and a small nudge toward beverages/desserts. Ported to SQL so the
-- guest page never needs a separate function deploy to get live suggestions.
create or replace function guest_get_recommendations(p_token uuid, p_limit int default 4)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_is_vip boolean;
  v_hour int;
  v_day_part text;
  v_categories text[];
  v_result jsonb;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  select vip into v_is_vip from guests where id = v_reservation.guest_id;

  v_hour := extract(hour from now());
  v_day_part := case
    when v_hour >= 6 and v_hour < 11 then 'breakfast'
    when v_hour >= 11 and v_hour < 15 then 'lunch'
    when v_hour >= 15 and v_hour < 18 then 'afternoon'
    when v_hour >= 18 and v_hour < 23 then 'dinner'
    else 'late_night'
  end;
  v_categories := case v_day_part
    when 'breakfast' then array['Breakfast', 'Beverages']
    when 'lunch' then array['Indian', 'Continental', 'Beverages']
    when 'afternoon' then array['Beverages', 'Desserts']
    when 'dinner' then array['Indian', 'Continental', 'Desserts']
    else array['Desserts', 'Beverages']
  end;

  with active_order_items as (
    select distinct (item->>'menuItemId') as menu_item_id
    from orders, jsonb_array_elements(items) as item
    where reservation_id = v_reservation.id and status <> 'delivered'
  ),
  delivered_items as (
    select distinct (item->>'menuItemId') as menu_item_id
    from orders, jsonb_array_elements(items) as item
    where reservation_id = v_reservation.id and status = 'delivered'
  ),
  scored as (
    select
      m.*,
      (
        (case when m.category = any(v_categories) then 3 else 0 end) +
        (case when d.menu_item_id is not null then 5 else 0 end) +
        (case when v_reservation.party_size >= 3
               and ('Popular' = any(m.tags) or m.category = 'Indian') then 2 else 0 end) +
        (case when coalesce(v_is_vip, false)
               and ('Chef Special' = any(m.tags) or 'Signature' = any(m.tags)) then 3 else 0 end) +
        (case when m.category in ('Beverages', 'Desserts') then 1 else 0 end)
      ) as score,
      (case
        when d.menu_item_id is not null then 'you enjoyed this earlier in your stay'
        when m.category = any(v_categories) then 'popular for ' || replace(v_day_part, '_', ' ')
        else 'suggested for you'
      end) as reason
    from menu_items m
    left join delivered_items d on d.menu_item_id = m.id
    where m.property_id = v_reservation.property_id
      and m.id not in (select menu_item_id from active_order_items)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'menuItemId', id, 'score', score, 'reason', reason,
    'menuItem', jsonb_build_object(
      'id', id, 'name', name, 'category', category, 'price', price,
      'description', description, 'image', image, 'isVeg', is_veg,
      'tags', tags, 'prepTime', prep_time
    )
  ) order by score desc), '[]'::jsonb)
  into v_result
  from (select * from scored where score > 0 order by score desc limit p_limit) scored;

  return v_result;
end;
$$;

-- Places an order and posts the folio charge in one transaction — the same
-- guarantee server/index.ts's POST /orders had (an order never exists
-- without its charge landing on the room bill).
create or replace function guest_place_order(p_token uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_total numeric(10, 2);
  v_order orders%rowtype;
  v_charge folio_charges%rowtype;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Order must have at least one item';
  end if;

  select sum((item->>'price')::numeric * (item->>'quantity')::numeric)
  into v_total
  from jsonb_array_elements(p_items) as item;

  insert into orders (property_id, reservation_id, room_id, items, total_amount, status)
  values (v_reservation.property_id, v_reservation.id, v_reservation.room_id, p_items, v_total, 'new')
  returning * into v_order;

  insert into folio_charges (property_id, reservation_id, order_id, description, amount, category)
  values (v_reservation.property_id, v_reservation.id, v_order.id,
          'Room service order ' || v_order.id, v_total, 'room_service')
  returning * into v_charge;

  return jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id, 'items', v_order.items, 'totalAmount', v_order.total_amount,
      'status', v_order.status, 'createdAt', v_order.created_at
    ),
    'charge', jsonb_build_object('id', v_charge.id, 'amount', v_charge.amount)
  );
end;
$$;

-- anon (the public/publishable key) gets exactly these three entry points —
-- nothing else, on nothing else.
revoke all on properties, staff_properties, rooms, guests, reservations, menu_items, orders, folio_charges from anon;
revoke execute on function staff_ticket_size_analytics(text) from public;
grant execute on function guest_get_context(uuid) to anon;
grant execute on function guest_get_recommendations(uuid, int) to anon;
grant execute on function guest_place_order(uuid, jsonb) to anon;
grant execute on function staff_ticket_size_analytics(text) to authenticated;
