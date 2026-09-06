-- "At Your Service" (Housekeeping / Amenities / Spa / Transfers) was four
-- hardcoded cards every property showed identically — a budget property
-- with no spa still advertised one; a property with a real business
-- center or airport lounge had no way to add it. This makes that grid
-- owner-managed, and — the actual point — tags every guest request with a
-- department so it's routed correctly instead of relying on a title-text
-- guess. Department reuses tasks.category's exact four values
-- (housekeeping/maintenance/amenities/concierge, 0003_ops_and_owner.sql),
-- so a request immediately lines up with Live Ops' existing filter tabs —
-- one department vocabulary for the whole app, not two that almost match.
-- Apply after 0001-0017.

create table service_categories (
  id text not null,
  property_id text not null references properties(id) on delete cascade,
  name text not null,
  description text not null default '',
  department text not null check (department in ('housekeeping', 'maintenance', 'amenities', 'concierge')),
  icon_key text not null default 'sparkles',
  sort_order int not null default 0,
  primary key (id, property_id)
);

alter table service_categories enable row level security;

create policy "staff can manage service categories on their property" on service_categories
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create index idx_service_categories_property on service_categories(property_id);

-- Which department a guest request belongs to — was implicit (Reception
-- had to guess from the title text, see the regex in logStaffRequest's
-- caller). Defaults to 'concierge' so every existing row (and the "Custom
-- Concierge Request" free-text button, which has no more specific
-- category) stays meaningful.
alter table guest_requests add column if not exists department text
  not null default 'concierge' check (department in ('housekeeping', 'maintenance', 'amenities', 'concierge'));

create or replace function guest_submit_request(p_token uuid, p_title text, p_priority text default 'Standard', p_department text default 'concierge')
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
  if p_department not in ('housekeeping', 'maintenance', 'amenities', 'concierge') then
    raise exception 'Invalid department: %', p_department;
  end if;

  select number into v_room_number from rooms where id = v_reservation.room_id;

  insert into guest_requests (property_id, reservation_id, room_number, title, priority, department)
  values (v_reservation.property_id, v_reservation.id, coalesce(v_room_number, '?'), p_title, coalesce(p_priority, 'Standard'), p_department)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function guest_submit_request(uuid, text, text, text) to anon;

-- guest_get_context gains the property's service catalog — GuestHome
-- renders whatever's here instead of the old fixed four cards.
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
        'department', s.department, 'iconKey', s.icon_key
      ) order by s.sort_order, s.name), '[]'::jsonb)
      from service_categories s where s.property_id = v_reservation.property_id
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
