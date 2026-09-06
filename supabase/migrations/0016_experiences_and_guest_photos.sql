-- Two guest-facing "photos I can't customize" gaps closed at once:
--
-- 1. GuestHome's hero banner was a hardcoded Google-hosted URL — the
--    property already has an owner-uploaded photo (properties.image,
--    0005_staff_mgmt_and_media.sql) that guest_get_context simply never
--    returned, so there was nothing to show it with.
-- 2. The "Curated For You" experience cards (Sunset Yacht Cruise, Chef's
--    Tasting Table) were hardcoded demo copy with no backing table at
--    all — an owner had no way to change them, let alone add their own.
--    This gives experiences the exact same shape as menu_items (own
--    table, owner-managed, image via the same Cloudinary upload flow).
--
-- Apply after 0001-0015.

create table experiences (
  id text not null,
  property_id text not null references properties(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric(10, 2) not null default 0,
  unit_label text not null default 'per person',
  image text not null default '',
  primary key (id, property_id)
);

alter table experiences enable row level security;

create policy "staff can manage experiences on their property" on experiences
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create index idx_experiences_property on experiences(property_id);

-- anon has zero direct grants on experiences (RLS default-denies, same as
-- every other guest-facing table) — guest_get_context is the only read path.
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
