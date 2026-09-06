-- The kitchen could only ever move an order forward (new -> preparing ->
-- ready) — there was no way to say "we can't make this" (out of an
-- ingredient, kitchen's closed, etc.), so a genuinely unfulfillable order
-- just sat there, and the guest kept getting charged for it on their folio
-- with no explanation. This adds a real reject path: a note is required,
-- the charge is voided (not just left on the bill), and both staff and the
-- guest are notified. Apply after 0001-0016.

alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('new', 'preparing', 'ready', 'delivered', 'rejected'));
alter table orders add column if not exists rejection_note text;

-- Only rejectable while still 'new' — once the kitchen has started
-- preparing it, the honest path is a phone call / staff request, not a
-- silent status flip. SECURITY DEFINER because it also needs to delete the
-- order's folio_charges row, which staff otherwise only have select on
-- (folio_charges is meant to be posted by the guest_* functions, not
-- edited freely — same reasoning as staff_checkout_reservation).
create or replace function staff_reject_order(p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if not is_staff_for_property(v_order.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_order.status <> 'new' then
    raise exception 'Only a new (not yet started) order can be rejected';
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'A reason is required so the guest knows why';
  end if;

  update orders set status = 'rejected', rejection_note = trim(p_note) where id = p_order_id;

  -- The guest should never be charged for an order the kitchen never made —
  -- delete rather than mark $0, so it simply doesn't appear on the bill.
  delete from folio_charges where order_id = p_order_id and settled_at is null;
end;
$$;

revoke execute on function staff_reject_order(uuid, text) from public;
grant execute on function staff_reject_order(uuid, text) to authenticated;

-- Staff-side heads-up, same pattern as notify_new_order (0007_notifications.sql).
create or replace function notify_order_rejected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_number text;
begin
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    select number into v_room_number from rooms where id = new.room_id;
    insert into notifications (property_id, type, title, body, room_number, ref_id)
    values (new.property_id, 'new_order', 'Order rejected — Room ' || coalesce(v_room_number, '?'),
            coalesce(new.rejection_note, ''), v_room_number, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_order_rejected on orders;
create trigger trg_notify_order_rejected after update on orders
  for each row execute function notify_order_rejected();

-- guest_get_active_order already excludes only 'delivered' — a rejected
-- order already matches that filter and needs no query change, just the
-- note threaded through so the guest sees *why*.
create or replace function guest_get_active_order(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_order orders%rowtype;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  select * into v_order from orders
  where reservation_id = v_reservation.id and status not in ('delivered', 'rejected')
  order by created_at desc
  limit 1;

  -- Nothing active — but if the *most recent* order was rejected, the
  -- guest still needs to see that (once, until they dismiss it), not just
  -- have it silently vanish the way a delivered order does.
  if not found then
    select * into v_order from orders
    where reservation_id = v_reservation.id and status = 'rejected'
    order by created_at desc
    limit 1;
    if not found then
      return null;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_order.id, 'status', v_order.status, 'items', v_order.items,
    'totalAmount', v_order.total_amount, 'createdAt', v_order.created_at,
    'rejectionNote', v_order.rejection_note
  );
end;
$$;

grant execute on function guest_get_active_order(uuid) to anon;
