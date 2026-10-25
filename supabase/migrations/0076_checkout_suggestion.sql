-- "Complete your order": what to offer when a guest presses Place order.
--
-- Ported from Churmuri's lib/meal-completion.js. Look at the shape of the
-- whole cart and ask what kind of thing is missing (a curry and a bread but
-- nothing to drink is missing a drink), because a gap gives the suggestion
-- a reason the guest can check in one glance ("Nothing to drink yet"),
-- which is most of the persuasion. Then offer the dishes of that kind that
-- guests here accept most.
--
-- Ranking: acceptance rate from offer_events (actions / impressions, any
-- surface), smoothed with a prior so a dish shown twice and taken once
-- doesn't outrank one taken 30 times in 100, plus how often it's been
-- ordered here in the last 60 days. Returns null when there's no real gap
-- or nothing on the menu fills it; the guest app then places the order
-- straight away. Read-only.
-- Apply after 0001-0075.

-- Same keyword taxonomy as Churmuri's menuCategoryType.
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
    else 'OTHER'
  end
  from (select lower(coalesce(p_category, '')) as n) x;
$$;

create or replace function guest_checkout_suggestion(p_token uuid, p_cart_item_ids text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_present text[];
  v_gap record;
  v_items jsonb;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if v_reservation.id is null then
    raise exception 'Invalid guest link';
  end if;

  select coalesce(array_agg(distinct menu_category_type(m.category)), '{}')
  into v_present
  from menu_items m
  where m.property_id = v_reservation.property_id and m.id = any(coalesce(p_cart_item_ids, '{}'));

  if cardinality(v_present) = 0 then
    return null;
  end if;

  -- Gaps in priority order; the first one the menu can fill wins. A combo
  -- already carries its own bread and sweet, so it's only offered a drink.
  for v_gap in
    select * from (values
      (1, 'BEVERAGE', array['MAIN', 'STARTER', 'BREAD', 'COMBO', 'SIDE'], 'Nothing to drink yet', 'Something to wash it down?'),
      (2, 'BREAD', array['MAIN'], 'Nothing on the side to share', 'Add something to share?'),
      (3, 'DESSERT', array['MAIN', 'COMBO'], 'No dessert yet', 'Finish on something sweet?'),
      (4, 'SIDE', array['MAIN'], 'Nothing on the side', 'Make it a proper meal?')
    ) as g(ord, type, needs, reason, pitch)
    order by ord
  loop
    continue when v_gap.type = any(v_present);
    continue when 'COMBO' = any(v_present) and v_gap.type <> 'BEVERAGE';
    continue when not (v_gap.needs && v_present);

    with stats as (
      select e.offer_id,
             count(*) filter (where e.event = 'impression') as shown,
             count(*) filter (where e.event = 'action') as taken
      from offer_events e
      where e.property_id = v_reservation.property_id and e.offer_type = 'menu_item'
      group by e.offer_id
    ), popularity as (
      select l->>'menuItemId' as item_id, sum(coalesce((l->>'quantity')::numeric, 1)) as qty
      from orders o, jsonb_array_elements(o.items) l
      where o.property_id = v_reservation.property_id and o.created_at > now() - interval '60 days'
      group by 1
    ), ranked as (
      select m.*,
             -- Beta(1, 3) prior: an unseen dish starts at a modest 25%.
             (coalesce(s.taken, 0) + 1)::numeric / (coalesce(s.shown, 0) + 4) as acceptance,
             coalesce(p.qty, 0) as ordered
      from menu_items m
      left join stats s on s.offer_id = m.id
      left join popularity p on p.item_id = m.id
      where m.property_id = v_reservation.property_id
        and menu_category_type(m.category) = v_gap.type
        and not (m.id = any(coalesce(p_cart_item_ids, '{}')))
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id, 'name', r.name, 'category', r.category, 'price', r.price,
             'description', r.description, 'image', r.image, 'isVeg', r.is_veg,
             'tags', r.tags, 'prepTime', r.prep_time, 'variations', r.variations, 'addons', r.addons
           ) order by r.score desc), '[]'::jsonb)
    into v_items
    from (
      select ranked.*, acceptance + least(ordered, 50) / 200.0 as score
      from ranked
      order by score desc, price asc
      limit 2
    ) r;

    if jsonb_array_length(v_items) > 0 then
      return jsonb_build_object('gap', v_gap.type, 'reason', v_gap.reason, 'pitch', v_gap.pitch, 'items', v_items);
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function guest_checkout_suggestion(uuid, text[]) from public;
grant execute on function guest_checkout_suggestion(uuid, text[]) to anon, authenticated;
