-- 0095: put guest_get_context back to the current version.
--
-- Production's copy had been replaced by the one in the older project's
-- 0007_property_currency.sql, which calls guest_active_reservation(uuid) (made by that
-- project's 0006, never applied here). With that function missing, every guest link and
-- every room-QR code failed to load the stay, and the guest app showed "No active stay".
-- This is the 0075 definition, unchanged. Safe to run again. Replacing a function keeps
-- its existing permissions.
--
-- Don't run SQL from the older "cabadra---hospitality-management-&-guest-experience-suite"
-- folder against this project: its migrations share numbers with this one and redefine
-- functions this project has since changed.
--
-- Apply after 0001-0094.

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
        'department', s.department, 'iconKey', s.icon_key, 'categoryType', s.category_type,
        'form', s.form
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
