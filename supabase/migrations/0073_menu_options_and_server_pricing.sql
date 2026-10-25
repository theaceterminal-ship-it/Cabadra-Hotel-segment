-- Menu sizes and add-ons, and room-service orders priced by the server.
--
-- 1. menu_items gets `variations` (sizes: pick exactly one, its price
--    replaces the base price) and `addons` (pick any, each adds its price),
--    both arrays of {id, name, price}. Same shape Churmuri's menu export
--    uses ("Small:220|Medium:320" / "Extra Cheese:40|Olives:30"), so its
--    CSV/zip imports straight in.
--
-- 2. guest_place_order used to take each line's price (and name) from the
--    guest's browser and charge the folio whatever it said: a tampered
--    request could order anything for 0, or a negative amount. It now takes
--    only menuItemId, quantity, variationId, addonIds and a note per line,
--    and looks every price and name up in menu_items itself. The stored
--    order lines keep the keys the kitchen screen, ETA bar and
--    recommendation analytics already read (name, quantity, price, note,
--    prepTime, menuItemId, fromRecommendation), with name spelling out the
--    choices, e.g. "Margherita Pizza (Large) + Extra Cheese".
--
-- 3. guest_get_context returns each dish's variations and addons so the
--    guest app can offer them. Otherwise identical to the live definition.
-- Apply after 0001-0072.

alter table menu_items
  add column if not exists variations jsonb not null default '[]'::jsonb,
  add column if not exists addons jsonb not null default '[]'::jsonb;

alter table menu_items drop constraint if exists menu_items_variations_is_array;
alter table menu_items add constraint menu_items_variations_is_array check (jsonb_typeof(variations) = 'array');
alter table menu_items drop constraint if exists menu_items_addons_is_array;
alter table menu_items add constraint menu_items_addons_is_array check (jsonb_typeof(addons) = 'array');

create or replace function guest_place_order(p_token uuid, p_items jsonb, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_line jsonb;
  v_menu menu_items%rowtype;
  v_qty integer;
  v_variation jsonb;
  v_addon_ids jsonb;
  v_addons jsonb;
  v_unit numeric(10, 2);
  v_name text;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric(10, 2) := 0;
  v_order orders%rowtype;
  v_charge folio_charges%rowtype;
  v_description text;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if v_reservation.id is null then
    raise exception 'Invalid guest link';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must have at least one item';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many items in one order';
  end if;

  for v_line in select value from jsonb_array_elements(p_items) loop
    select * into v_menu
    from menu_items
    where id = v_line->>'menuItemId' and property_id = v_reservation.property_id;
    if v_menu.id is null then
      raise exception 'An item in your order is no longer on the menu';
    end if;

    v_qty := coalesce(nullif(v_line->>'quantity', '')::numeric, 0)::integer;
    if v_qty < 1 or v_qty > 50 then
      raise exception 'Invalid quantity for %', v_menu.name;
    end if;

    -- Size: one is required when the dish has sizes; its price replaces the base price.
    v_variation := null;
    if jsonb_array_length(v_menu.variations) > 0 then
      select value into v_variation
      from jsonb_array_elements(v_menu.variations)
      where value->>'id' = v_line->>'variationId';
      if v_variation is null then
        raise exception 'Choose a size for %', v_menu.name;
      end if;
      v_unit := (v_variation->>'price')::numeric;
    else
      v_unit := v_menu.price;
    end if;

    -- Add-ons: only ones this dish offers, each counted once.
    v_addon_ids := case when jsonb_typeof(v_line->'addonIds') = 'array' then v_line->'addonIds' else '[]'::jsonb end;
    select coalesce(jsonb_agg(jsonb_build_object('id', a.value->>'id', 'name', a.value->>'name', 'price', (a.value->>'price')::numeric) order by a.ord), '[]'::jsonb)
    into v_addons
    from jsonb_array_elements(v_menu.addons) with ordinality as a(value, ord)
    where v_addon_ids ? (a.value->>'id');
    if jsonb_array_length(v_addons) <> (select count(distinct x) from jsonb_array_elements_text(v_addon_ids) x) then
      raise exception 'An add-on you chose for % is no longer available', v_menu.name;
    end if;
    v_unit := v_unit + coalesce((select sum((x->>'price')::numeric) from jsonb_array_elements(v_addons) x), 0);

    v_name := v_menu.name
      || coalesce(' (' || (v_variation->>'name') || ')', '')
      || coalesce(' + ' || (select string_agg(x->>'name', ', ') from jsonb_array_elements(v_addons) x), '');

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'menuItemId', v_menu.id,
      'name', v_name,
      'price', v_unit,
      'quantity', v_qty,
      'note', nullif(left(trim(coalesce(v_line->>'note', '')), 200), ''),
      'prepTime', v_menu.prep_time,
      'fromRecommendation', coalesce((v_line->>'fromRecommendation')::boolean, false),
      'variationId', v_variation->>'id',
      'addons', v_addons
    ));
    v_total := v_total + v_unit * v_qty;
  end loop;

  select string_agg((l->>'quantity') || 'x ' || (l->>'name'), ', ' order by ord)
  into v_description
  from jsonb_array_elements(v_lines) with ordinality as t(l, ord);

  insert into orders (property_id, reservation_id, room_id, items, total_amount, status, notes)
  values (v_reservation.property_id, v_reservation.id, v_reservation.room_id, v_lines, v_total, 'new', nullif(left(trim(p_notes), 500), ''))
  returning * into v_order;

  insert into folio_charges (property_id, reservation_id, order_id, description, amount, category)
  values (v_reservation.property_id, v_reservation.id, v_order.id,
          coalesce(v_description, 'Room service order'), v_total, 'room_service')
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
    'property', jsonb_build_object('id', p.id, 'name', p.name, 'currency', p.currency, 'image', p.image),
    'room', jsonb_build_object('id', rm.id, 'number', rm.number, 'type', rm.type),
    'guest', jsonb_build_object('name', g.name, 'vip', g.vip),
    'menu', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'category', m.category, 'price', m.price,
        'description', m.description, 'image', m.image, 'isVeg', m.is_veg,
        'tags', m.tags, 'prepTime', m.prep_time,
        'variations', m.variations, 'addons', m.addons
      )), '[]'::jsonb)
      from menu_items m where m.property_id = v_reservation.property_id
    ),
    'experiences', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'description', e.description,
        'price', e.price, 'unitLabel', e.unit_label, 'image', e.image
      ) order by e.name), '[]'::jsonb)
      from experiences e where e.property_id = v_reservation.property_id
    ),
    'serviceCategories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description,
        'department', s.department, 'iconKey', s.icon_key, 'categoryType', s.category_type
      ) order by s.sort_order, s.name), '[]'::jsonb)
      from service_categories s where s.property_id = v_reservation.property_id
    ),
    'transportRoutes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'from', t.from_location, 'to', t.to_location,
        'price', t.price, 'priceUnit', t.price_unit
      ) order by t.from_location), '[]'::jsonb)
      from transport_routes t where t.property_id = v_reservation.property_id
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
