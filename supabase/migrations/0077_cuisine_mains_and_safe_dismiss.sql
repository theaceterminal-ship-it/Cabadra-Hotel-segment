-- Two fixes to the guest side.
--
-- 1. menu_category_type (0076) didn't know cuisine-named categories
--    ("Italian", "Thai", "Japanese"...), so those dishes were OTHER and
--    never triggered "Complete your order". A hotel that files dishes by
--    cuisine is filing mains, so they count as MAIN.
--
-- 2. guest_dismiss_request marked the request resolved whatever state its
--    task was in. A guest tidying the status sheet could close a request
--    staff were still working on, and lost all tracking of it. Now only a
--    request whose task is finished (completed or rejected) can be cleared;
--    anything still in progress stays tracked.
-- Apply after 0001-0076.

create or replace function menu_category_type(p_category text)
returns text
language sql
immutable
as $$
  select case
    when n ~ '(combo|thali|platter|meal box|meal for|family pack|feast)' then 'COMBO'
    when n ~ '(bread|naan|roti|paratha|rice|kulcha)' then 'BREAD'
    when n ~ '(main|curry|gravy|biryani|biriyani|indian|chinese|tandoor|grill|pizza|burger|pasta|sandwich|wrap|roll|sub|noodle|momo|bowl|steak|taco|special)' then 'MAIN'
    when n ~ '(starter|appetizer|kebab|tikka|snack|finger food|nugget|wing|popcorn)' then 'STARTER'
    when n ~ '(soup|shorba)' then 'SOUP'
    when n ~ '(side|salad|raita|papad|pickle|accompaniment|fries|wedge|dip|topping)' then 'SIDE'
    when n ~ '(beverage|drink|juice|mocktail|lassi|coffee|tea|chai|shake|soda|water|mojito|smoothie|cola|refresher)' then 'BEVERAGE'
    when n ~ '(dessert|sweet|ice cream|kulfi|gulab|halwa|cake|brownie|waffle|pastry)' then 'DESSERT'
    when n ~ '(italian|thai|japanese|mexican|american|british|mediterranean|asian|continental|korean|french|lebanese|greek|spanish|tibetan|himachali|punjabi|south indian|north indian|oriental|fusion)' then 'MAIN'
    else 'OTHER'
  end
  from (select lower(coalesce(p_category, '')) as n) x;
$$;

create or replace function guest_dismiss_request(p_token uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_task_status text;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  select t.status into v_task_status
  from guest_requests gr
  join tasks t on t.guest_request_id = gr.id
  where gr.id = p_request_id and gr.reservation_id = v_reservation.id;

  if v_task_status is null or v_task_status not in ('completed', 'rejected') then
    raise exception 'This request is still being handled, so it stays on your list until it''s done.';
  end if;

  update guest_requests
  set status = 'resolved', resolved_at = now()
  where id = p_request_id and reservation_id = v_reservation.id;
end;
$$;

revoke all on function guest_dismiss_request(uuid, uuid) from public;
grant execute on function guest_dismiss_request(uuid, uuid) to anon, authenticated;
