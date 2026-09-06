-- Transportation is a real special case among "services": a generic
-- Housekeeping/Amenities card just needs a free-text note, but a transfer
-- request is naturally "from X to Y at a set price" — a small route
-- catalog the owner defines once (airport ↔ property, property ↔ old
-- town...), which the guest then picks from or searches, instead of
-- typing the same handful of destinations out by hand every time. Apply
-- after 0001-0022.

alter table service_categories add column if not exists category_type text
  not null default 'general' check (category_type in ('general', 'transportation'));

create table transport_routes (
  id text not null,
  property_id text not null references properties(id) on delete cascade,
  from_location text not null,
  to_location text not null,
  price numeric(10, 2) not null default 0,
  price_unit text not null default 'per trip',
  primary key (id, property_id)
);

alter table transport_routes enable row level security;

create policy "staff can manage transport routes on their property" on transport_routes
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create index idx_transport_routes_property on transport_routes(property_id);

-- guest_get_context gains the route catalog and each service category's
-- type, so GuestHome can show a route picker instead of a free-text box
-- specifically for transportation-type categories.
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
        'tags', m.tags, 'prepTime', m.prep_time
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
