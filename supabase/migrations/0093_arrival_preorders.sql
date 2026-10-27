-- 0093: have something ready on arrival.
--
-- A day before arrival (pre_arrival email, 0092's queue) the guest is offered up to three
-- things from the hotel's own menu, picked for their arrival time and the season. Each
-- button in the email is a link that works once (arrival_links). Opening it, in a real
-- browser, records the request (arrival_requests) and shows "ready when you arrive".
-- Payment is at the hotel: nothing is charged until check-in.
--
-- The kitchen needs no new screen. 45 minutes before the arrival time a job turns the
-- requests into one ordinary room-service order (status new, with a note saying it is a
-- pre-order and the guest isn't here yet), so it shows up on the kitchen display and
-- notifies staff like any other. The bill line is added when the guest checks in. If the
-- booking is cancelled first, requests that haven't reached the kitchen are dropped.
--
-- Off by default for every hotel (properties.pre_arrival_enabled): the owner turns it on in
-- Guest emails once the kitchen is ready for it.
--
-- Not a learned recommendation: dishes are picked by meal period (from the arrival time) and the
-- season, ranked by what this hotel's guests order most. A dish has to suit the time of day to be
-- offered at all, and when nothing does, no email goes out. Dishes with sizes, and alcohol, are never offered.
--
-- Apply after 0001-0092.

alter table properties add column if not exists pre_arrival_enabled boolean not null default false;

alter table guest_email_outbox drop constraint if exists guest_email_outbox_kind_check;
alter table guest_email_outbox add constraint guest_email_outbox_kind_check
  check (kind in ('booking_confirmation', 'pre_arrival', 'checkout_thanks'));

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'new_order', 'guest_request', 'high_priority_request', 'task_created',
    'new_arrival', 'task_completed', 'task_rejected', 'folio_chat_message', 'housekeeping', 'arrival_request'
  ));

-- ---------------------------------------------------------------------------
-- 1. Owner switch (replaces 0092's version; same rules plus the new switch)
-- ---------------------------------------------------------------------------
create or replace function owner_update_guest_email_settings(p_property_id text, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_maps text := nullif(trim(p_settings->>'mapsUrl'), '');
  v_review text := nullif(trim(p_settings->>'googleReviewUrl'), '');
  v_in text := nullif(trim(p_settings->>'checkInTime'), '');
  v_out text := nullif(trim(p_settings->>'checkOutTime'), '');
  v_welcome text := nullif(trim(p_settings->>'welcomeNote'), '');
  v_thanks text := nullif(trim(p_settings->>'thanksNote'), '');
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only the property owner can change guest email settings';
  end if;
  if v_maps is not null and (v_maps !~* '^https://[^\s]+$' or length(v_maps) > 500) then
    raise exception 'The map link should start with https:// (copy it from Google Maps: Share, Copy link)';
  end if;
  if v_review is not null and (v_review !~* '^https://[^\s]+$' or length(v_review) > 500) then
    raise exception 'The review link should start with https:// (your Google Business profile has a "Get more reviews" link)';
  end if;
  if v_in is not null and v_in !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Check-in time should look like 14:00';
  end if;
  if v_out is not null and v_out !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Check-out time should look like 11:00';
  end if;
  if length(coalesce(v_welcome, '')) > 500 or length(coalesce(v_thanks, '')) > 500 then
    raise exception 'Notes can be up to 500 characters';
  end if;
  update properties set
    guest_emails_enabled = coalesce((p_settings->>'enabled')::boolean, true),
    pre_arrival_enabled = coalesce((p_settings->>'preArrival')::boolean, pre_arrival_enabled),
    maps_url = v_maps,
    check_in_time = v_in,
    check_out_time = v_out,
    welcome_note = v_welcome,
    thanks_note = v_thanks,
    google_review_url = v_review
  where id = p_property_id;
end;
$$;
revoke all on function owner_update_guest_email_settings(text, jsonb) from public, anon;
grant execute on function owner_update_guest_email_settings(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The tables
-- ---------------------------------------------------------------------------
create table if not exists arrival_links (
  token text primary key default encode(gen_random_bytes(24), 'hex'),
  reservation_id uuid not null references reservations(id) on delete cascade,
  property_id text not null,
  menu_item_id text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists arrival_links_reservation on arrival_links (reservation_id);
alter table arrival_links enable row level security;
revoke all on arrival_links from anon, authenticated;

create table if not exists arrival_requests (
  id uuid primary key default gen_random_uuid(),
  link_token text unique references arrival_links(token) on delete set null,
  reservation_id uuid not null references reservations(id) on delete cascade,
  property_id text not null,
  menu_item_id text not null,
  item_name text not null,
  quantity integer not null default 1 check (quantity between 1 and 10),
  -- requested: waiting; in_kitchen: now an order; cancelled: the guest changed their mind; void: booking cancelled or the dish went off the menu
  status text not null default 'requested' check (status in ('requested', 'in_kitchen', 'cancelled', 'void')),
  -- the guest's own "I'll be there around…"; otherwise the reservation's arrival time is used
  ready_at_override timestamptz,
  order_id uuid references orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists arrival_requests_reservation on arrival_requests (reservation_id);
create index if not exists arrival_requests_open on arrival_requests (property_id) where status = 'requested';
alter table arrival_requests enable row level security;
revoke all on arrival_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Choosing what to offer
-- ---------------------------------------------------------------------------
create or replace function system_arrival_suggestions(p_reservation_id uuid, p_limit integer default 3)
returns table (menu_item_id text, name text, price numeric, category text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_hour integer;
  v_month integer;
  v_period_rx text;
  v_cold boolean;
  v_alcohol_rx constant text := 'beer|wine|whisk|vodka|rum\y|gin\y|cocktail|scotch|brandy|champagne|liquor|tequila|bourbon|lager|mojito|margarita|spirit|\ymalt';
  v_cold_rx constant text := 'soup|tea|chai|coffee|kadha|cocoa';
begin
  select * into v_res from reservations where id = p_reservation_id;
  if not found then return; end if;
  v_hour := extract(hour from (coalesce(v_res.updated_eta, v_res.check_in) at time zone 'Asia/Kolkata'))::int;
  v_month := extract(month from (v_res.check_in at time zone 'Asia/Kolkata'))::int;
  v_cold := v_month in (11, 12, 1, 2) or (v_month in (3, 10));
  v_period_rx := case
    when v_hour < 11 then 'breakfast|paratha|omelet|poha|idli|dosa|toast|egg|pancake|waffle|tea|chai|coffee|juice'
    when v_hour < 15 then 'thali|biryani|rice|dal|roti|naan|paneer|curry|pasta|salad|sandwich|burger|noodle|main'
    when v_hour < 19 then 'chai|tea|coffee|pakora|pakoda|samosa|sandwich|snack|soup|momo|fries|cake|cookie|pastry|starter'
    else 'biryani|thali|curry|dal|roti|naan|paneer|pasta|soup|noodle|rice|grill|main|dessert'
  end;
  return query
  select m.id, m.name, m.price, m.category
  from menu_items m
  where m.property_id = v_res.property_id
    and m.price > 0
    and jsonb_array_length(coalesce(m.variations, '[]'::jsonb)) = 0
    and (m.name || ' ' || coalesce(m.category, '')) !~* v_alcohol_rx
    -- It has to suit the time of day (or be a warm soup or drink in the cold months); being popular is not enough.
    and (m.name ~* v_period_rx or coalesce(m.category, '') ~* v_period_rx or (v_cold and m.name ~* v_cold_rx))
  order by
    ((m.name ~* v_period_rx)::int * 3 + (coalesce(m.category, '') ~* v_period_rx)::int
      + (v_cold and m.name ~* v_cold_rx)::int * 2
      + (coalesce(m.image, '') <> '')::int  -- a dish with a photo looks better in the email
      + ln(1 + (select count(*) from orders o, jsonb_array_elements(o.items) li
                where o.property_id = m.property_id and li->>'menuItemId' = m.id))) desc,
    m.name
  limit greatest(p_limit, 1);
end;
$$;
revoke all on function system_arrival_suggestions(uuid, integer) from public, anon, authenticated;
grant execute on function system_arrival_suggestions(uuid, integer) to service_role;

-- The three links in the email. Safe to call again for the same stay: it returns the same unused ones.
create or replace function system_make_arrival_links(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_res reservations%rowtype;
  s record;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if not found or v_res.status <> 'upcoming' then
    return '[]'::jsonb;
  end if;
  if not exists (select 1 from arrival_links where reservation_id = p_reservation_id) then
    for s in select * from system_arrival_suggestions(p_reservation_id, 3) loop
      insert into arrival_links (reservation_id, property_id, menu_item_id) values (p_reservation_id, v_res.property_id, s.menu_item_id);
    end loop;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('token', l.token, 'name', m.name, 'price', m.price, 'image', nullif(m.image, '')) order by l.created_at, m.name)
    from arrival_links l join menu_items m on m.id = l.menu_item_id and m.property_id = l.property_id
    where l.reservation_id = p_reservation_id and l.used_at is null
  ), '[]'::jsonb);
end;
$$;
revoke all on function system_make_arrival_links(uuid) from public, anon, authenticated;
grant execute on function system_make_arrival_links(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The guest's side: tap, change the time, change their mind. None of these raise
-- for an ordinary miss, so the counts they keep are not rolled back.
-- ---------------------------------------------------------------------------
create or replace function arrival_link_ip()
returns text
language plpgsql
stable
as $$
declare
  v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  return coalesce(
    nullif(trim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '')
  );
end;
$$;

create or replace function guest_redeem_arrival_link(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text := arrival_link_ip();
  v_bucket text;
  v_link arrival_links%rowtype;
  v_res reservations%rowtype;
  v_item menu_items%rowtype;
  v_prop properties%rowtype;
  v_guest guests%rowtype;
  v_room rooms%rowtype;
  v_req arrival_requests%rowtype;
  v_eta timestamptz;
begin
  v_bucket := case when v_ip is not null then 'arrival_link_failures:' || v_ip end;
  if v_bucket is not null then
    delete from rate_limit_hits where bucket_key = v_bucket and hit_at < now() - interval '10 minutes';
    if (select count(*) from rate_limit_hits where bucket_key = v_bucket) >= 20 then
      return jsonb_build_object('status', 'slow_down');
    end if;
  end if;

  select * into v_link from arrival_links where token = left(coalesce(p_token, ''), 80) for update;
  if not found then
    if v_bucket is not null then insert into rate_limit_hits (bucket_key) values (v_bucket); end if;
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_res from reservations where id = v_link.reservation_id;
  select * into v_prop from properties where id = v_res.property_id;
  select * into v_item from menu_items where id = v_link.menu_item_id and property_id = v_link.property_id;
  select * into v_guest from guests where id = v_res.guest_id;
  select * into v_room from rooms where id = v_res.room_id;
  v_eta := coalesce(v_res.updated_eta, v_res.check_in);

  -- Opened again (or by a second device): show what was already asked for.
  if v_link.used_at is not null then
    select * into v_req from arrival_requests where link_token = v_link.token;
    return jsonb_build_object(
      'status', case when v_req.status in ('cancelled', 'void') then 'cancelled' else 'already' end,
      'property_name', v_prop.name, 'item_name', coalesce(v_req.item_name, v_item.name), 'image', nullif(v_item.image, ''),
      'ready_at', coalesce(v_req.ready_at_override, v_eta), 'in_kitchen', v_req.status = 'in_kitchen'
    );
  end if;

  if v_res.status = 'checked_in' then
    return jsonb_build_object('status', 'arrived', 'property_name', v_prop.name);
  end if;
  if v_res.status <> 'upcoming' or v_item.id is null or not v_prop.pre_arrival_enabled then
    return jsonb_build_object('status', 'closed', 'property_name', v_prop.name);
  end if;

  insert into arrival_requests (link_token, reservation_id, property_id, menu_item_id, item_name)
  values (v_link.token, v_res.id, v_res.property_id, v_item.id, v_item.name)
  returning * into v_req;
  update arrival_links set used_at = now() where token = v_link.token;

  insert into notifications (property_id, type, title, body, room_number, ref_id)
  values (v_res.property_id, 'arrival_request', 'Pre-order for arrival',
          v_guest.name || ' · Room ' || v_room.number || ' · ' || v_item.name || ', ready around '
            || to_char(v_eta at time zone 'Asia/Kolkata', 'FMHH12:MI AM'),
          v_room.number, v_req.id);

  return jsonb_build_object(
    'status', 'ok', 'property_name', v_prop.name, 'item_name', v_item.name, 'image', nullif(v_item.image, ''), 'ready_at', v_eta, 'in_kitchen', false
  );
end;
$$;
revoke all on function guest_redeem_arrival_link(text) from public;
grant execute on function guest_redeem_arrival_link(text) to anon, authenticated;

create or replace function guest_cancel_arrival_request(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req arrival_requests%rowtype;
begin
  select * into v_req from arrival_requests where link_token = left(coalesce(p_token, ''), 80) for update;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if v_req.status = 'in_kitchen' then return jsonb_build_object('status', 'too_late'); end if;
  if v_req.status = 'requested' then
    update arrival_requests set status = 'cancelled', updated_at = now() where id = v_req.id;
  end if;
  return jsonb_build_object('status', 'cancelled');
end;
$$;
revoke all on function guest_cancel_arrival_request(text) from public;
grant execute on function guest_cancel_arrival_request(text) to anon, authenticated;

-- "I'll be there around 6": moves the ready time for this stay's requests (not the booking's own arrival time).
create or replace function guest_set_arrival_time(p_token text, p_ready_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req arrival_requests%rowtype;
  v_res reservations%rowtype;
begin
  select * into v_req from arrival_requests where link_token = left(coalesce(p_token, ''), 80);
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  select * into v_res from reservations where id = v_req.reservation_id;
  if v_res.status <> 'upcoming' then return jsonb_build_object('status', 'closed'); end if;
  if p_ready_at is null or p_ready_at < now() - interval '1 hour' or p_ready_at > v_res.check_out then
    return jsonb_build_object('status', 'out_of_range');
  end if;
  if exists (select 1 from arrival_requests where reservation_id = v_res.id and status = 'in_kitchen') then
    return jsonb_build_object('status', 'too_late');
  end if;
  update arrival_requests set ready_at_override = p_ready_at, updated_at = now()
  where reservation_id = v_res.id and status = 'requested';
  return jsonb_build_object('status', 'ok', 'ready_at', p_ready_at);
end;
$$;
revoke all on function guest_set_arrival_time(text, timestamptz) from public;
grant execute on function guest_set_arrival_time(text, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Into the kitchen, and onto the bill
-- ---------------------------------------------------------------------------
-- Turns each stay's waiting requests into one order, 45 minutes before the arrival time (or now, if p_force).
create or replace function system_convert_arrival_requests(p_reservation_id uuid default null, p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_made integer := 0;
  v_lines jsonb;
  v_total numeric(10, 2);
  v_order orders%rowtype;
  v_ready timestamptz;
  v_notes text;
begin
  -- A booking that is gone takes its waiting requests with it.
  update arrival_requests q set status = 'void', updated_at = now()
  from reservations s
  where q.reservation_id = s.id and q.status = 'requested' and s.status not in ('upcoming', 'checked_in')
    and (p_reservation_id is null or s.id = p_reservation_id);

  for r in
    select s.id as reservation_id, s.property_id, s.room_id,
           min(coalesce(q.ready_at_override, s.updated_eta, s.check_in)) as ready_at
    from arrival_requests q join reservations s on s.id = q.reservation_id
    where q.status = 'requested' and s.status in ('upcoming', 'checked_in')
      and (p_reservation_id is null or s.id = p_reservation_id)
    group by s.id
    having p_force or min(coalesce(q.ready_at_override, s.updated_eta, s.check_in)) - interval '45 minutes' <= now()
  loop
    -- Dishes that are gone from the menu drop out; prices are today's.
    update arrival_requests q set status = 'void', updated_at = now()
    where q.reservation_id = r.reservation_id and q.status = 'requested'
      and not exists (select 1 from menu_items m where m.id = q.menu_item_id and m.property_id = q.property_id);

    select jsonb_agg(jsonb_build_object(
             'menuItemId', m.id, 'name', m.name, 'price', m.price, 'quantity', q.quantity, 'note', null,
             'prepTime', m.prep_time, 'fromRecommendation', true, 'variationId', null, 'addons', '[]'::jsonb) order by q.created_at),
           sum(m.price * q.quantity)
    into v_lines, v_total
    from arrival_requests q join menu_items m on m.id = q.menu_item_id and m.property_id = q.property_id
    where q.reservation_id = r.reservation_id and q.status = 'requested';
    continue when v_lines is null;

    v_ready := greatest(r.ready_at, now());
    v_notes := 'PRE-ORDER for arrival, ready around ' || to_char(v_ready at time zone 'Asia/Kolkata', 'FMHH12:MI AM')
      || '. Pay at the hotel.' || case when exists (select 1 from reservations where id = r.reservation_id and status = 'upcoming') then ' Guest has not checked in yet.' else '' end;

    insert into orders (property_id, reservation_id, room_id, items, total_amount, status, notes)
    values (r.property_id, r.reservation_id, r.room_id, v_lines, v_total, 'new', v_notes)
    returning * into v_order;

    update arrival_requests set status = 'in_kitchen', order_id = v_order.id, updated_at = now()
    where reservation_id = r.reservation_id and status = 'requested';
    v_made := v_made + 1;
  end loop;
  return v_made;
end;
$$;
revoke all on function system_convert_arrival_requests(uuid, boolean) from public, anon, authenticated;
grant execute on function system_convert_arrival_requests(uuid, boolean) to service_role;

-- When the stay changes: arriving sends anything still waiting to the kitchen and puts the pre-orders
-- on the bill; a cancelled booking drops what hasn't reached the kitchen.
create or replace function arrival_requests_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  v_desc text;
begin
  if new.status = 'checked_in' and old.status is distinct from 'checked_in' then
    perform system_convert_arrival_requests(new.id, true);
    for o in
      select distinct od.id, od.total_amount, od.items
      from arrival_requests q join orders od on od.id = q.order_id
      where q.reservation_id = new.id and od.status <> 'rejected'
        and not exists (select 1 from folio_charges f where f.order_id = od.id)
    loop
      select string_agg((l->>'quantity') || 'x ' || (l->>'name'), ', ') into v_desc from jsonb_array_elements(o.items) l;
      insert into folio_charges (property_id, reservation_id, order_id, description, amount, category)
      values (new.property_id, new.id, o.id, coalesce(v_desc, 'Room service order') || ' (pre-ordered)', o.total_amount, 'room_service');
    end loop;
  elsif new.status in ('cancelled', 'checked_out') and old.status is distinct from new.status then
    update arrival_requests set status = 'void', updated_at = now() where reservation_id = new.id and status = 'requested';
  end if;
  return new;
end;
$$;
revoke all on function arrival_requests_on_status() from public, anon, authenticated;
drop trigger if exists arrival_requests_on_status on reservations;
create trigger arrival_requests_on_status after update of status on reservations
  for each row execute function arrival_requests_on_status();

select cron.unschedule('convert-arrival-requests')
where exists (select 1 from cron.job where jobname = 'convert-arrival-requests');
select cron.schedule('convert-arrival-requests', '*/5 * * * *', $$select system_convert_arrival_requests()$$);

-- ---------------------------------------------------------------------------
-- 6. Reception's view
-- ---------------------------------------------------------------------------
create or replace function staff_arrival_preorders(p_property_id text)
returns table (reservation_id uuid, item_name text, quantity integer, status text, ready_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  return query
  select q.reservation_id, q.item_name, q.quantity, q.status, coalesce(q.ready_at_override, s.updated_eta, s.check_in)
  from arrival_requests q join reservations s on s.id = q.reservation_id
  where q.property_id = p_property_id and s.status = 'upcoming' and q.status in ('requested', 'in_kitchen')
  order by 5, q.created_at;
end;
$$;
revoke all on function staff_arrival_preorders(text) from public, anon;
grant execute on function staff_arrival_preorders(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The pre-arrival email: queued with every advance booking, sent only if the hotel has it on
-- ---------------------------------------------------------------------------
create or replace function guest_email_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.status = 'upcoming' and new.source = 'built_in' then
      insert into guest_email_outbox (reservation_id, property_id, kind, due_at)
      values (new.id, new.property_id, 'booking_confirmation', now() + interval '1 minute')
      on conflict (reservation_id, kind) do nothing;
      -- The offer goes out the day before (about 20 hours ahead), but never before the confirmation has had half an hour to itself,
      -- and not at all if the arrival is closer than 90 minutes.
      v_due := greatest(new.check_in - interval '20 hours', now() + interval '30 minutes');
      if v_due < new.check_in - interval '90 minutes' then
        insert into guest_email_outbox (reservation_id, property_id, kind, due_at)
        values (new.id, new.property_id, 'pre_arrival', v_due)
        on conflict (reservation_id, kind) do nothing;
      end if;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('cancelled', 'checked_in') then
      update guest_email_outbox set status = 'skipped', error = 'the stay changed before this went out'
      where reservation_id = new.id and kind in ('booking_confirmation', 'pre_arrival') and status = 'pending';
    end if;
    if new.status = 'checked_out' then
      insert into guest_email_outbox (reservation_id, property_id, kind, due_at)
      values (new.id, new.property_id, 'checkout_thanks', now() + interval '90 minutes')
      on conflict (reservation_id, kind) do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- A moved arrival moves the offer with it.
create or replace function guest_email_reschedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due timestamptz;
begin
  if new.check_in is distinct from old.check_in and new.status = 'upcoming' then
    v_due := greatest(new.check_in - interval '20 hours', now() + interval '5 minutes');
    if v_due < new.check_in - interval '90 minutes' then
      update guest_email_outbox set due_at = v_due where reservation_id = new.id and kind = 'pre_arrival' and status = 'pending';
    else
      update guest_email_outbox set status = 'skipped', error = 'the arrival is too close' where reservation_id = new.id and kind = 'pre_arrival' and status = 'pending';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function guest_email_reschedule() from public, anon, authenticated;
drop trigger if exists guest_email_reschedule on reservations;
create trigger guest_email_reschedule after update of check_in on reservations
  for each row execute function guest_email_reschedule();

-- The email's context also carries the arrival time and the switch.
create or replace function system_guest_email_context(p_reservation_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reservation', jsonb_build_object(
      'id', r.id, 'status', r.status, 'source', r.source, 'booking_ref', r.booking_ref,
      'check_in', r.check_in, 'check_out', r.check_out, 'updated_eta', r.updated_eta, 'party_size', r.party_size, 'rate_per_night', r.rate_per_night
    ),
    'guest', jsonb_build_object('name', g.name, 'email', nullif(trim(g.email), '')),
    'room', jsonb_build_object('number', rm.number, 'type', rm.type),
    'property', jsonb_build_object(
      'id', p.id, 'name', p.name, 'location', p.location, 'image', p.image, 'currency', p.currency,
      'enabled', p.guest_emails_enabled, 'pre_arrival_enabled', p.pre_arrival_enabled,
      'address', coalesce(p.billing_address, p.location), 'phone', p.billing_phone, 'reply_to', p.billing_email,
      'maps_url', p.maps_url, 'check_in_time', p.check_in_time, 'check_out_time', p.check_out_time,
      'welcome_note', p.welcome_note, 'thanks_note', p.thanks_note, 'google_review_url', p.google_review_url
    ),
    'domain', (select jsonb_build_object('domain', d.domain, 'local_part', d.local_part)
               from property_email_domains d where d.property_id = p.id and d.status = 'verified')
  )
  from reservations r
  join guests g on g.id = r.guest_id
  join rooms rm on rm.id = r.room_id
  join properties p on p.id = r.property_id
  where r.id = p_reservation_id
$$;
revoke all on function system_guest_email_context(uuid) from public, anon, authenticated;
grant execute on function system_guest_email_context(uuid) to service_role;
