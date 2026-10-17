-- Migration 0058: Grant execute to both authenticated and anon roles for guest chat functions,
-- and add SECURITY DEFINER RPCs for staff chat operations to ensure reliable bi-directional messaging.

-- 1. Grant guest chat functions to authenticated as well as anon
grant execute on function guest_fetch_chat_messages(uuid) to authenticated, anon;
grant execute on function guest_send_chat_message(uuid, text) to authenticated, anon;

-- 2. Create staff_fetch_chat_messages RPC
create or replace function staff_fetch_chat_messages(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_result jsonb;
begin
  select * into v_reservation from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reservation not found';
  end if;

  if not is_staff_for_property(v_reservation.property_id) then
    raise exception 'Not authorized for this property';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'sender', m.sender, 'body', m.body, 'createdAt', m.created_at
  ) order by m.created_at asc), '[]'::jsonb)
  into v_result
  from folio_chat_messages m
  where m.reservation_id = p_reservation_id;

  return v_result;
end;
$$;

revoke execute on function staff_fetch_chat_messages(uuid) from public;
grant execute on function staff_fetch_chat_messages(uuid) to authenticated, anon;

-- 3. Create staff_send_chat_message RPC
create or replace function staff_send_chat_message(p_property_id text, p_reservation_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message folio_chat_messages%rowtype;
begin
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Message cannot be empty';
  end if;

  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;

  insert into folio_chat_messages (property_id, reservation_id, sender, body)
  values (p_property_id, p_reservation_id, 'staff', trim(p_body))
  returning * into v_message;

  return jsonb_build_object('id', v_message.id, 'sender', v_message.sender, 'body', v_message.body, 'createdAt', v_message.created_at);
end;
$$;

revoke execute on function staff_send_chat_message(text, uuid, text) from public;
grant execute on function staff_send_chat_message(text, uuid, text) to authenticated, anon;
