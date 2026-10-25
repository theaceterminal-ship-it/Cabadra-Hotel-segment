-- The kitchen's own screen: a link reception copies (Reception > Kitchen >
-- Kitchen link) and opens once on the kitchen's tablet or phone. No login;
-- the token in the link is the key, like the department displays (0046),
-- and it's a department_displays row with department 'kitchen', so the
-- same revoke (active = false) applies. Resetting the link makes the old
-- one stop working at once, for a lost or replaced device.
--
-- Unlike a department display, which shows tasks, the kitchen screen shows
-- the food orders: new, preparing, ready, plus the last few hours' finished
-- ones. The kitchen can start an order, mark it ready (or back to
-- preparing), or reject a new one with a reason, which voids its charge
-- exactly as reception's reject does. Delivery stays with whoever runs it.
-- Apply after 0001-0081.

create or replace function staff_kitchen_link(p_property_id text, p_reset boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display department_displays%rowtype;
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_reset then
    update department_displays set active = false
    where property_id = p_property_id and department = 'kitchen' and active;
  end if;
  select * into v_display from department_displays
  where property_id = p_property_id and department = 'kitchen' and active
  order by created_at desc
  limit 1;
  if v_display.id is null then
    insert into department_displays (property_id, department, label, created_by)
    values (p_property_id, 'kitchen', 'Kitchen screen', auth.uid())
    returning * into v_display;
  end if;
  return jsonb_build_object('token', v_display.token, 'label', v_display.label, 'lastUsedAt', v_display.last_used_at, 'createdAt', v_display.created_at);
end;
$$;
revoke all on function staff_kitchen_link(text, boolean) from public, anon;
grant execute on function staff_kitchen_link(text, boolean) to authenticated;

create or replace function kitchen_resolve(p_token uuid)
returns department_displays
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display department_displays%rowtype;
begin
  select * into v_display from department_displays where token = p_token and active and department = 'kitchen';
  if v_display.id is null then
    raise exception 'This kitchen link has been replaced or switched off. Ask reception for the new one.';
  end if;
  update department_displays set last_used_at = now() where id = v_display.id;
  return v_display;
end;
$$;
revoke all on function kitchen_resolve(uuid) from public, anon, authenticated;

create or replace function kitchen_display_orders(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display department_displays%rowtype;
begin
  v_display := kitchen_resolve(p_token);
  return jsonb_build_object(
    'propertyName', (select name from properties where id = v_display.property_id),
    'serverTime', now(),
    'orders', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'status', o.status, 'items', o.items, 'notes', o.notes, 'rejectionNote', o.rejection_note,
        'createdAt', o.created_at, 'roomNumber', coalesce(rm.number, o.room_id), 'vip', coalesce(g.vip, false)
      ) order by o.created_at), '[]'::jsonb)
      from orders o
      left join rooms rm on rm.id = o.room_id
      left join reservations r on r.id = o.reservation_id
      left join guests g on g.id = r.guest_id
      where o.property_id = v_display.property_id
        and (o.status in ('new', 'preparing', 'ready')
             or (o.status in ('delivered', 'rejected') and o.created_at > now() - interval '6 hours'))
    )
  );
end;
$$;
revoke all on function kitchen_display_orders(uuid) from public;
grant execute on function kitchen_display_orders(uuid) to anon, authenticated;

create or replace function kitchen_display_set_status(p_token uuid, p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display department_displays%rowtype;
  v_order orders%rowtype;
begin
  v_display := kitchen_resolve(p_token);
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null or v_order.property_id <> v_display.property_id then
    raise exception 'That order isn''t on this kitchen screen';
  end if;
  if not (
    (v_order.status = 'new' and p_status in ('preparing', 'ready'))
    or (v_order.status = 'preparing' and p_status = 'ready')
    or (v_order.status = 'ready' and p_status = 'preparing')
  ) then
    raise exception 'Can''t move an order from % to %', v_order.status, p_status;
  end if;
  update orders set status = p_status where id = p_order_id;
end;
$$;
revoke all on function kitchen_display_set_status(uuid, uuid, text) from public;
grant execute on function kitchen_display_set_status(uuid, uuid, text) to anon, authenticated;

-- The same as reception's reject (staff_reject_order, 0079): only a new
-- order, a reason the guest sees, and its charge voided off the bill.
create or replace function kitchen_display_reject(p_token uuid, p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display department_displays%rowtype;
  v_order orders%rowtype;
begin
  v_display := kitchen_resolve(p_token);
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null or v_order.property_id <> v_display.property_id then
    raise exception 'That order isn''t on this kitchen screen';
  end if;
  if v_order.status <> 'new' then
    raise exception 'Only a new (not yet started) order can be rejected';
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'A reason is required so the guest knows why';
  end if;
  update orders set status = 'rejected', rejection_note = trim(p_note) where id = p_order_id;
  update folio_charges
  set voided_at = now(), void_reason = 'Order rejected: ' || trim(p_note)
  where order_id = p_order_id and voided_at is null;
end;
$$;
revoke all on function kitchen_display_reject(uuid, uuid, text) from public;
grant execute on function kitchen_display_reject(uuid, uuid, text) to anon, authenticated;
