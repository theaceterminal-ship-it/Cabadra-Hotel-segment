-- Room-service folio charges said only "Room service order <uuid>" — no
-- indication of what was actually ordered, on the folio timeline
-- (RoomFolioModal) or the printed checkout bill, since both just render
-- folio_charges.description directly (staffApi.ts / RoomFolioModal.tsx —
-- no frontend change needed, this is the one place the text comes from).
-- Now builds a real itemized line from the order's own items, e.g.
-- "2x Club Sandwich, 1x Fresh Lime Soda" instead of a bare id.
--
-- Same signature as the live function (0004_guest_context_name.sql), so
-- this is a plain replace — no drop/ambiguity concern.
create or replace function guest_place_order(p_token uuid, p_items jsonb, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_total numeric(10, 2);
  v_order orders%rowtype;
  v_charge folio_charges%rowtype;
  v_description text;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Order must have at least one item';
  end if;

  select sum((item->>'price')::numeric * (item->>'quantity')::numeric)
  into v_total
  from jsonb_array_elements(p_items) as item;

  select string_agg((item->>'quantity') || 'x ' || (item->>'name'), ', ' order by ord)
  into v_description
  from jsonb_array_elements(p_items) with ordinality as t(item, ord);

  insert into orders (property_id, reservation_id, room_id, items, total_amount, status, notes)
  values (v_reservation.property_id, v_reservation.id, v_reservation.room_id, p_items, v_total, 'new', nullif(trim(p_notes), ''))
  returning * into v_order;

  insert into folio_charges (property_id, reservation_id, order_id, description, amount, category)
  values (v_reservation.property_id, v_reservation.id, v_order.id,
          coalesce(v_description, 'Room service order'), v_total, 'room_service')
  returning * into v_charge;

  return jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id, 'items', v_order.items, 'totalAmount', v_order.total_amount,
      'status', v_order.status, 'createdAt', v_order.created_at, 'notes', v_order.notes
    ),
    'charge', jsonb_build_object('id', v_charge.id, 'amount', v_charge.amount)
  );
end;
$$;

-- Backfill: existing charges already on properties' live folios still say
-- "Room service order <uuid>" — rebuild their description from the
-- order's own items now that we're not creating new ones this way.
update folio_charges fc
set description = (
  select string_agg((item->>'quantity') || 'x ' || (item->>'name'), ', ' order by ord)
  from jsonb_array_elements(o.items) with ordinality as t(item, ord)
)
from orders o
where fc.order_id = o.id
  and fc.description like 'Room service order %';
