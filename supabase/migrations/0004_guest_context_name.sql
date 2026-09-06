-- guest_get_context() didn't return the guest's own name/VIP flag, so the
-- guest page had no real source for "Welcome, {name}" and had to fall back
-- to placeholder text. CREATE OR REPLACE — safe to run even though
-- 0001_init.sql already created this function.

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
    'guest', jsonb_build_object('name', g.name, 'vip', g.vip),
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
  from properties p, rooms rm, guests g
  where p.id = v_reservation.property_id
    and rm.id = v_reservation.room_id
    and g.id = v_reservation.guest_id;

  return v_result;
end;
$$;

-- The guest home page's "active order" banner needs a real source instead
-- of always showing a fixed fake ticket — this is that source: the most
-- recent order on this stay that hasn't been delivered yet, or null.
create or replace function guest_get_active_order(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_order orders%rowtype;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  select * into v_order from orders
  where reservation_id = v_reservation.id and status <> 'delivered'
  order by created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_order.id, 'status', v_order.status, 'items', v_order.items,
    'totalAmount', v_order.total_amount, 'createdAt', v_order.created_at
  );
end;
$$;

grant execute on function guest_get_active_order(uuid) to anon;

-- guest_place_order() had no way to carry the dietary/prep note the guest
-- types in the cart drawer — it was collected in the UI and silently
-- dropped. Give orders a real column for it and thread it through. This
-- changes the function's signature (adds p_notes), so the old 2-arg
-- version from 0001_init.sql is dropped rather than left as dead overload.
alter table orders add column if not exists notes text;

drop function if exists guest_place_order(uuid, jsonb);

create or replace function guest_place_order(p_token uuid, p_items jsonb, p_notes text default null)
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

  insert into orders (property_id, reservation_id, room_id, items, total_amount, status, notes)
  values (v_reservation.property_id, v_reservation.id, v_reservation.room_id, p_items, v_total, 'new', nullif(trim(p_notes), ''))
  returning * into v_order;

  insert into folio_charges (property_id, reservation_id, order_id, description, amount, category)
  values (v_reservation.property_id, v_reservation.id, v_order.id,
          'Room service order ' || v_order.id, v_total, 'room_service')
  returning * into v_charge;

  return jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id, 'items', v_order.items, 'totalAmount', v_order.total_amount,
      'status', v_order.status, 'createdAt', v_order.created_at, 'notes', v_order.notes
    ),
    'charge', jsonb_build_object('id', v_charge.id, 'amount', v_charge.amount)
  );
end;
$$;

grant execute on function guest_place_order(uuid, jsonb, text) to anon;
