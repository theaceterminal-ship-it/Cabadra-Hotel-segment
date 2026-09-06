-- Per-property currency, set once at property creation (owner picks a
-- country, the client derives a currency from it — see src/lib/currency.ts)
-- instead of every price in the app being hardcoded to USD. Apply after
-- 0001-0011.

alter table properties add column if not exists country text;
alter table properties add column if not exists currency text not null default 'USD';

-- Same overload-conflict reasoning as 0010_property_creation_image.sql: a
-- new default parameter alongside the old signature would make existing
-- 4-arg calls ambiguous, so the old one is dropped rather than shadowed.
drop function if exists staff_create_property(text, text, text, text);

create or replace function staff_create_property(
  p_id text, p_name text, p_location text, p_image text default null,
  p_country text default null, p_currency text default 'USD'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;
  insert into properties (id, name, location, status, image, country, currency)
  values (p_id, p_name, p_location, 'active', nullif(trim(p_image), ''), nullif(trim(p_country), ''), coalesce(nullif(trim(p_currency), ''), 'USD'));
  insert into staff_properties (user_id, property_id, role) values (auth.uid(), p_id, 'owner');
end;
$$;

revoke execute on function staff_create_property(text, text, text, text, text, text) from public;
grant execute on function staff_create_property(text, text, text, text, text, text) to authenticated;

-- guest_get_context() is the guest app's one source of property info — it
-- needs the currency too, so RoomDiningView/GuestHome can format prices in
-- the property's own currency instead of an assumed default.
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
    'property', jsonb_build_object('id', p.id, 'name', p.name, 'currency', p.currency),
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

-- notify_new_order() (0007_notifications.sql) hardcoded a '$' into the
-- notification body text — wrong now that properties can be in any
-- currency. The notification is a transient heads-up, not a formatted
-- receipt, so it drops the symbol entirely rather than trying to look up
-- and format a currency inside a trigger.
create or replace function notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_number text;
begin
  select number into v_room_number from rooms where id = new.room_id;
  insert into notifications (property_id, type, title, body, room_number, ref_id)
  values (new.property_id, 'new_order', 'New order — Room ' || coalesce(v_room_number, '?'),
          new.total_amount || ' · ' || jsonb_array_length(new.items) || ' item(s)', v_room_number, new.id);
  return new;
end;
$$;
