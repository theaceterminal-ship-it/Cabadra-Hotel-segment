-- Folio Chat (system-design doc, Phase A brainstorm) — a message thread
-- between a guest and reception, tied to their stay. Builds the simplest
-- version: one thread per reservation, text only, no attachments, no read
-- receipts. Guest side is the usual no-login capability-token model
-- (guest_token proves the stay, same as every other guest_* RPC); staff
-- side is plain RLS via is_staff_for_property, same as guest_requests.
--
-- Staff messages are attributed to "Reception" rather than a named staff
-- member — staff_properties (0001) has no display name, only auth.uid()
-- and role, and every other guest-facing surface in this app (order
-- status, request status) is already department/role-level rather than
-- individual. Apply after 0001-0051.

create table folio_chat_messages (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  sender text not null check (sender in ('guest', 'staff')),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

alter table folio_chat_messages enable row level security;

create policy "staff can view and send messages on their property" on folio_chat_messages
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create index idx_folio_chat_reservation on folio_chat_messages(reservation_id, created_at);
create index idx_folio_chat_property on folio_chat_messages(property_id, created_at);

-- No anon policy at all — the table itself is invisible to anon (unlike
-- guest_requests, which doesn't need to be, since nothing there is as
-- free-form as a chat message). Every guest read/write goes through the
-- two SECURITY DEFINER functions below instead, same reasoning as every
-- other guest_* function: a raw table grant would mean knowing a
-- reservation_id is enough to read someone else's conversation, where the
-- guest_token is supposed to be the only thing that proves it's yours.
revoke all on folio_chat_messages from anon;

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
    'id', m.id, 'sender', m.sender, 'body', m.body, 'createdAt', m.created_at
  ) order by m.created_at asc), '[]'::jsonb)
  into v_result
  from folio_chat_messages m
  where m.reservation_id = v_reservation.id;

  return v_result;
end;
$$;

grant execute on function guest_fetch_chat_messages(uuid) to anon;

create or replace function guest_send_chat_message(p_token uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_message folio_chat_messages%rowtype;
begin
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Message cannot be empty';
  end if;

  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  insert into folio_chat_messages (property_id, reservation_id, sender, body)
  values (v_reservation.property_id, v_reservation.id, 'guest', trim(p_body))
  returning * into v_message;

  return jsonb_build_object('id', v_message.id, 'sender', v_message.sender, 'body', v_message.body, 'createdAt', v_message.created_at);
end;
$$;

grant execute on function guest_send_chat_message(uuid, text) to anon;

-- Staff-side heads-up, same pattern as notify_guest_request (0007) and
-- notify_task_rejected (0045) — only on a guest-sent message, since staff
-- don't need to be notified of their own reply.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('new_order', 'guest_request', 'high_priority_request', 'task_created', 'new_arrival', 'task_completed', 'task_rejected', 'folio_chat_message'));

create or replace function notify_folio_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_number text;
begin
  if new.sender <> 'guest' then
    return new;
  end if;

  select r.number into v_room_number
  from reservations res join rooms r on r.id = res.room_id
  where res.id = new.reservation_id;

  insert into notifications (property_id, type, title, body, room_number, ref_id)
  values (
    new.property_id, 'folio_chat_message', 'New message — Room ' || coalesce(v_room_number, '?'),
    new.body, v_room_number, new.reservation_id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_folio_chat_message on folio_chat_messages;
create trigger trg_notify_folio_chat_message after insert on folio_chat_messages
  for each row execute function notify_folio_chat_message();
