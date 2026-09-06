-- Durable, per-room QR codes for room service.
--
-- guest_token (0001_init.sql) is deliberately per-reservation — a fresh one
-- every stay, so an old guest's link can't still work after they check out.
-- That's correct for the link a receptionist hands a guest directly, but
-- it's the wrong shape for a QR code printed once and stuck on a room
-- door: that sticker needs to work for *whoever is currently staying
-- there*, indefinitely, the same way tableorder's static per-table QR
-- does. So instead of encoding a guest_token, the room QR encodes a stable
-- URL (/guest/room/:roomId) that resolves to the *current* checked-in
-- reservation's token at scan time — same guest_get_context() flow
-- underneath, just resolved one step later. Apply after 0001-0010.

create or replace function guest_resolve_room_token(p_room_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  select r.guest_token into v_token
  from reservations r
  where r.room_id = p_room_id and r.status = 'checked_in'
  order by r.created_at desc
  limit 1;

  if v_token is null then
    raise exception 'No guest is currently checked into this room';
  end if;

  return v_token;
end;
$$;

-- Callable by anon, same trust level as the guest_* functions in
-- 0001_init.sql: this hands back a capability token, but only for a room
-- that's genuinely occupied right now, and the actual security boundary is
-- the same one a physical door sticker always relies on — you have to be
-- there to scan it.
grant execute on function guest_resolve_room_token(text) to anon;
