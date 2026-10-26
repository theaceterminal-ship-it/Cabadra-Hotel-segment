-- Guest chat, both ends: a reception inbox, read receipts, and a fix.
--
--   * Reception had no list of conversations: a guest's message only
--     showed up as a bell notification, and the thread was reachable only
--     from that room's card. staff_chat_inbox lists every conversation at
--     the property (rooms staying now, and any thread from the last 30
--     days) with the room number, the latest message and how many guest
--     messages nobody at the desk has read yet.
--   * Read receipts: seen_at on a message is when the other side opened the
--     thread after it arrived (staff_mark_chat_seen, guest_mark_chat_seen).
--     Both fetches now return it, so each side can show "Seen".
--   * Typing indicators are live (Supabase Realtime broadcast), not stored.
--     Both ends join a channel named after a hash of the stay's guest link,
--     which only the guest and the hotel's staff know; the inbox returns it
--     for staff (chatChannel), the guest computes it from its own link.
--   * Fix: staff_send_chat_message checked the sender was staff at the
--     property it named, but not that the stay belonged to that property,
--     so staff at one hotel could post into another hotel's guest thread.
-- Apply after 0001-0085.

alter table folio_chat_messages add column if not exists seen_at timestamptz;
create index if not exists idx_folio_chat_unseen on folio_chat_messages (property_id) where sender = 'guest' and seen_at is null;

-- The realtime channel for a stay's chat: sha256 of its guest link token.
create or replace function chat_channel_for(p_guest_token uuid)
returns text
language sql
immutable
as $$
  select 'chat-' || encode(sha256(convert_to(p_guest_token::text, 'UTF8')), 'hex');
$$;

create or replace function guest_fetch_chat_messages(p_token uuid)
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'sender', m.sender, 'body', m.body, 'createdAt', m.created_at, 'seen', m.seen_at is not null
  ) order by m.created_at asc), '[]'::jsonb)
  into v_result
  from folio_chat_messages m
  where m.reservation_id = v_reservation.id;

  return v_result;
end;
$$;

-- The guest opened the chat: reception's messages so far are seen.
create or replace function guest_mark_chat_seen(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation_id uuid;
begin
  select id into v_reservation_id from reservations where guest_token = p_token;
  if v_reservation_id is null then
    raise exception 'Invalid guest link';
  end if;
  update folio_chat_messages set seen_at = now()
  where reservation_id = v_reservation_id and sender = 'staff' and seen_at is null;
end;
$$;
revoke all on function guest_mark_chat_seen(uuid) from public;
grant execute on function guest_mark_chat_seen(uuid) to anon, authenticated;

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
    'id', m.id, 'sender', m.sender, 'body', m.body, 'createdAt', m.created_at, 'seen', m.seen_at is not null
  ) order by m.created_at asc), '[]'::jsonb)
  into v_result
  from folio_chat_messages m
  where m.reservation_id = p_reservation_id;

  return v_result;
end;
$$;

-- Reception opened the thread: the guest's messages so far are seen.
create or replace function staff_mark_chat_seen(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property text;
begin
  select property_id into v_property from reservations where id = p_reservation_id;
  if v_property is null or not is_staff_for_property(v_property) then
    raise exception 'Not authorized for this property';
  end if;
  update folio_chat_messages set seen_at = now()
  where reservation_id = p_reservation_id and sender = 'guest' and seen_at is null;
  -- The bell's chat notifications for this room are dealt with too.
  update notifications set read_at = now()
  where property_id = v_property and type = 'folio_chat_message' and read_at is null
    and ref_id = p_reservation_id;
end;
$$;
revoke all on function staff_mark_chat_seen(uuid) from public, anon;
grant execute on function staff_mark_chat_seen(uuid) to authenticated;

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
  if not exists (select 1 from reservations where id = p_reservation_id and property_id = p_property_id) then
    raise exception 'Not authorized for this property';
  end if;

  insert into folio_chat_messages (property_id, reservation_id, sender, body)
  values (p_property_id, p_reservation_id, 'staff', left(trim(p_body), 2000))
  returning * into v_message;

  -- Replying means the guest's messages have been read.
  update folio_chat_messages set seen_at = now()
  where reservation_id = p_reservation_id and sender = 'guest' and seen_at is null;

  return jsonb_build_object('id', v_message.id, 'sender', v_message.sender, 'body', v_message.body, 'createdAt', v_message.created_at, 'seen', false);
end;
$$;
revoke execute on function staff_send_chat_message(text, uuid, text) from public, anon;
grant execute on function staff_send_chat_message(text, uuid, text) to authenticated;
revoke execute on function staff_fetch_chat_messages(uuid) from public, anon;
grant execute on function staff_fetch_chat_messages(uuid) to authenticated;

-- Every conversation at the property, newest first: rooms staying now
-- (even with no messages yet, so the desk can start one) and any thread
-- with messages in the last 30 days.
create or replace function staff_chat_inbox(p_property_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'reservationId', x.id, 'roomNumber', x.room_number, 'guestName', x.guest_name, 'status', x.status,
      'lastBody', x.last_body, 'lastSender', x.last_sender, 'lastAt', x.last_at, 'unread', x.unread,
      'chatChannel', chat_channel_for(x.guest_token)
    ) order by x.unread > 0 desc, x.last_at desc nulls last, x.room_number), '[]'::jsonb)
    from (
      select r.id, r.status, r.guest_token, rm.number as room_number, g.name as guest_name,
             lm.body as last_body, lm.sender as last_sender, lm.created_at as last_at,
             (select count(*) from folio_chat_messages u where u.reservation_id = r.id and u.sender = 'guest' and u.seen_at is null) as unread
      from reservations r
      join guests g on g.id = r.guest_id
      left join rooms rm on rm.id = r.room_id
      left join lateral (
        select m.body, m.sender, m.created_at from folio_chat_messages m
        where m.reservation_id = r.id order by m.created_at desc limit 1
      ) lm on true
      where r.property_id = p_property_id
        and (r.status = 'checked_in' or lm.created_at > now() - interval '30 days')
    ) x
  );
end;
$$;
revoke all on function staff_chat_inbox(text) from public, anon;
grant execute on function staff_chat_inbox(text) to authenticated;

-- The guest's own realtime channel name (the same hash staff get above).
create or replace function guest_chat_channel(p_token uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from reservations where guest_token = p_token) then
    raise exception 'Invalid guest link';
  end if;
  return chat_channel_for(p_token);
end;
$$;
revoke all on function guest_chat_channel(uuid) from public;
grant execute on function guest_chat_channel(uuid) to anon, authenticated;
