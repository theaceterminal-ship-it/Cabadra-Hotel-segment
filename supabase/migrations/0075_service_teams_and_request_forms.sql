-- Services: eight teams instead of four, and request forms the owner builds.
--
-- 1. Teams. The fixed four (housekeeping, maintenance, amenities,
--    concierge) become: front_desk, housekeeping, maintenance, concierge,
--    laundry, spa, transport, kitchen. "amenities" is retired: spa-type
--    services move to spa, everything else to front_desk (which Reception
--    works from its own dashboard). Every check constraint and function
--    that listed the old four now lists these.
--
-- 2. Request forms. Each service gets `form` (jsonb):
--      choices  [{id, label, price}]  buttons the guest taps; price 0 = free
--      multiple boolean               may pick several (else exactly one)
--      quantity boolean               ask how many of each (e.g. laundry)
--      askTime  boolean               ask for a preferred time
--      note     boolean               offer a note box
--    The route picker (category_type 'transportation') is only for the
--    transport team; existing transfer services move there.
--
-- 3. Priced requests, charged when done. guest_submit_service_request
--    reads the service's own choices (or the transfer route) and works out
--    the title and price itself; the browser only says which choices and
--    how many. The price is stored on the request and copied to its task
--    (with the reservation), so the existing task_complete_core posts the
--    folio charge when staff mark it done — nothing is billed if it's
--    rejected or never done.
-- Apply after 0001-0074.

-- 1. Teams --------------------------------------------------------------------

alter table tasks drop constraint if exists tasks_category_check;
alter table service_categories drop constraint if exists service_categories_department_check;
alter table guest_requests drop constraint if exists guest_requests_department_check;
alter table staff_directory drop constraint if exists staff_directory_department_check;
alter table department_displays drop constraint if exists department_displays_department_check;
alter table shifts drop constraint if exists shifts_department_check;

update service_categories set department = 'spa'
  where department = 'amenities' and (name ~* 'spa|massage|wellness|sauna|salon' or description ~* 'spa|massage|sauna');
update service_categories set department = 'front_desk' where department = 'amenities';
update tasks set category = 'front_desk' where category = 'amenities';
update guest_requests set department = 'front_desk' where department = 'amenities';
update staff_directory set department = 'front_desk' where department = 'amenities';
update department_displays set department = 'front_desk' where department = 'amenities';
update shifts set department = 'front_desk' where department = 'amenities';

alter table tasks add constraint tasks_category_check
  check (category in ('front_desk', 'housekeeping', 'maintenance', 'concierge', 'laundry', 'spa', 'transport', 'kitchen'));
alter table service_categories add constraint service_categories_department_check
  check (department in ('front_desk', 'housekeeping', 'maintenance', 'concierge', 'laundry', 'spa', 'transport', 'kitchen'));
alter table guest_requests add constraint guest_requests_department_check
  check (department in ('front_desk', 'housekeeping', 'maintenance', 'concierge', 'laundry', 'spa', 'transport', 'kitchen'));
alter table staff_directory add constraint staff_directory_department_check
  check (department in ('front_desk', 'housekeeping', 'maintenance', 'concierge', 'laundry', 'spa', 'transport', 'kitchen'));
alter table department_displays add constraint department_displays_department_check
  check (department in ('front_desk', 'housekeeping', 'maintenance', 'concierge', 'laundry', 'spa', 'transport', 'kitchen'));
alter table shifts add constraint shifts_department_check
  check (department in ('front_desk', 'housekeeping', 'maintenance', 'concierge', 'laundry', 'spa', 'transport', 'kitchen'));

create or replace function staff_reassign_task_department(p_task_id uuid, p_department text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
begin
  select * into v_task from tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;
  if not is_staff_for_property(v_task.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_department not in ('front_desk', 'housekeeping', 'maintenance', 'concierge', 'laundry', 'spa', 'transport', 'kitchen') then
    raise exception 'Unknown department: %', p_department;
  end if;

  update tasks set category = p_department, assigned_to = null where id = p_task_id;

  if v_task.guest_request_id is not null then
    update guest_requests set department = p_department where id = v_task.guest_request_id;
  end if;

  return jsonb_build_object('taskId', p_task_id, 'category', p_department);
end;
$$;

-- The older 3-argument overload has no department at all; the 4-argument
-- one is what the guest app's quick requests use.
drop function if exists guest_submit_request(uuid, text, text);

create or replace function guest_submit_request(p_token uuid, p_title text, p_priority text default 'Standard', p_department text default 'front_desk')
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
  if v_reservation.id is null then
    raise exception 'Invalid guest link';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Request needs a title';
  end if;
  if p_department not in ('front_desk', 'housekeeping', 'maintenance', 'concierge', 'laundry', 'spa', 'transport', 'kitchen') then
    raise exception 'Invalid department: %', p_department;
  end if;

  select number into v_room_number from rooms where id = v_reservation.room_id;

  insert into guest_requests (property_id, reservation_id, room_number, title, priority, department)
  values (v_reservation.property_id, v_reservation.id, coalesce(v_room_number, '?'), left(trim(p_title), 300), coalesce(p_priority, 'Standard'), p_department)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function guest_submit_request(uuid, text, text, text) from public;
grant execute on function guest_submit_request(uuid, text, text, text) to anon, authenticated;

-- 2. Request forms ------------------------------------------------------------

alter table service_categories add column if not exists form jsonb not null default '{}'::jsonb;
alter table service_categories drop constraint if exists service_categories_form_is_object;
alter table service_categories add constraint service_categories_form_is_object check (jsonb_typeof(form) = 'object');

update service_categories set department = 'transport' where category_type = 'transportation';
alter table service_categories drop constraint if exists service_categories_route_picker_is_transport;
alter table service_categories add constraint service_categories_route_picker_is_transport
  check (category_type <> 'transportation' or department = 'transport');

-- 3. Priced requests ----------------------------------------------------------

alter table guest_requests add column if not exists price numeric(10, 2);
alter table guest_requests add column if not exists details jsonb;

create or replace function auto_create_task_from_guest_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into tasks (property_id, room_label, title, priority, status, category, guest_request_id, reservation_id, price)
  values (
    new.property_id,
    coalesce('Room ' || new.room_number, ''),
    new.title,
    case when new.priority = 'High Priority' then 'high' else 'standard' end,
    'pending',
    coalesce(new.department, 'front_desk'),
    new.id,
    new.reservation_id,
    -- Charged by task_complete_core when the task is marked done.
    case when new.price > 0 then new.price end
  );
  return new;
end;
$$;

/**
 * p_choices: [{id, quantity}] picked from the service's form.choices.
 * p_route_id: the transfer route, for route-picker services.
 * Returns the new request's id and the price that will be charged on completion.
 */
create or replace function guest_submit_service_request(
  p_token uuid,
  p_service_id text,
  p_choices jsonb default '[]'::jsonb,
  p_route_id text default null,
  p_time text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_service service_categories%rowtype;
  v_route transport_routes%rowtype;
  v_room_number text;
  v_form jsonb;
  v_pick jsonb;
  v_choice jsonb;
  v_qty integer;
  v_picked jsonb := '[]'::jsonb;
  v_price numeric(10, 2) := 0;
  v_parts text[] := '{}';
  v_time text := nullif(left(trim(coalesce(p_time, '')), 60), '');
  v_note text := nullif(left(trim(coalesce(p_note, '')), 300), '');
  v_title text;
  v_id uuid;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if v_reservation.id is null then
    raise exception 'Invalid guest link';
  end if;

  select * into v_service from service_categories
  where id = p_service_id and property_id = v_reservation.property_id;
  if v_service.id is null then
    raise exception 'This service is no longer offered';
  end if;
  v_form := coalesce(v_service.form, '{}'::jsonb);

  if v_service.category_type = 'transportation' then
    select * into v_route from transport_routes
    where id = p_route_id and property_id = v_reservation.property_id;
    if v_route.id is null then
      raise exception 'Choose a route';
    end if;
    v_price := coalesce(v_route.price, 0);
    v_parts := array[v_route.from_location || ' → ' || v_route.to_location];
  else
    if p_choices is not null and jsonb_typeof(p_choices) = 'array' then
      for v_pick in select value from jsonb_array_elements(p_choices) loop
        select value into v_choice
        from jsonb_array_elements(coalesce(v_form->'choices', '[]'::jsonb))
        where value->>'id' = v_pick->>'id';
        if v_choice is null then
          raise exception 'One of your choices is no longer available';
        end if;
        v_qty := case when coalesce((v_form->>'quantity')::boolean, false)
                      then least(greatest(coalesce(nullif(v_pick->>'quantity', '')::numeric, 1)::integer, 1), 20)
                      else 1 end;
        -- Each choice counts once, however often it was sent.
        if not v_picked @> jsonb_build_array(jsonb_build_object('id', v_choice->>'id')) then
          v_picked := v_picked || jsonb_build_array(jsonb_build_object(
            'id', v_choice->>'id', 'label', v_choice->>'label',
            'price', coalesce((v_choice->>'price')::numeric, 0), 'quantity', v_qty));
          v_price := v_price + coalesce((v_choice->>'price')::numeric, 0) * v_qty;
          v_parts := v_parts || ((v_choice->>'label') || case when v_qty > 1 then ' ×' || v_qty else '' end);
        end if;
        v_choice := null;
      end loop;
    end if;

    if jsonb_array_length(coalesce(v_form->'choices', '[]'::jsonb)) > 0 and jsonb_array_length(v_picked) = 0 then
      raise exception 'Choose an option';
    end if;
    if not coalesce((v_form->>'multiple')::boolean, false) and jsonb_array_length(v_picked) > 1 then
      raise exception 'Choose just one option';
    end if;
  end if;

  if coalesce((v_form->>'askTime')::boolean, false) is false then
    v_time := null;
  end if;
  if coalesce((v_form->>'note')::boolean, true) is false then
    v_note := null;
  end if;
  if array_length(v_parts, 1) is null and v_time is null and v_note is null then
    raise exception 'Tell us what you need';
  end if;

  v_title := v_service.name
    || coalesce(': ' || array_to_string(v_parts, ', '), '')
    || coalesce(' · at ' || v_time, '')
    || coalesce(' — ' || v_note, '');

  select number into v_room_number from rooms where id = v_reservation.room_id;

  insert into guest_requests (property_id, reservation_id, room_number, title, priority, department, price, details)
  values (
    v_reservation.property_id, v_reservation.id, coalesce(v_room_number, '?'), left(v_title, 300), 'Standard',
    v_service.department, nullif(v_price, 0),
    jsonb_build_object('serviceId', v_service.id, 'choices', v_picked, 'routeId', v_route.id, 'time', v_time, 'note', v_note)
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'price', v_price, 'title', v_title);
end;
$$;

revoke all on function guest_submit_service_request(uuid, text, jsonb, text, text, text) from public;
grant execute on function guest_submit_service_request(uuid, text, jsonb, text, text, text) to anon, authenticated;

-- The guest app needs each service's form.
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
