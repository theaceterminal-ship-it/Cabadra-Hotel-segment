-- Real walk-in check-in.
--
-- Every guest_* function so far assumed a reservation already existed
-- (seeded, or created by some booking channel this app doesn't have yet).
-- There was no way for Reception to actually create one — "check a guest
-- in" only ever meant flipping an *existing upcoming* reservation
-- (staff_check_in_reservation). This adds the other half: a receptionist
-- taking a walk-in, entering their contact details (and optionally an ID
-- photo), and assigning them straight to a room. That reservation row —
-- guest name/phone/email attached, status 'checked_in' — is exactly what
-- guest_resolve_room_token (0011_room_qr.sql) needs to know a room's QR
-- belongs to this specific person until they check out. Apply after
-- 0001-0012.

alter table guests add column if not exists id_document_url text;

create or replace function staff_checkin_new_guest(
  p_property_id text,
  p_room_id text,
  p_guest_name text,
  p_guest_phone text default null,
  p_guest_email text default null,
  p_guest_vip boolean default false,
  p_id_document_url text default null,
  p_check_out timestamptz default null,
  p_party_size int default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
  v_guest_id uuid;
  v_reservation_id uuid;
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_guest_name is null or length(trim(p_guest_name)) = 0 then
    raise exception 'Guest name is required';
  end if;

  select * into v_room from rooms where id = p_room_id and property_id = p_property_id;
  if not found then
    raise exception 'Room not found on this property';
  end if;
  if v_room.status not in ('ready', 'dirty', 'cleaning') then
    raise exception 'Room % is not available to check in (status: %)', v_room.number, v_room.status;
  end if;

  insert into guests (name, email, phone, vip, id_document_url)
  values (trim(p_guest_name), nullif(trim(p_guest_email), ''), nullif(trim(p_guest_phone), ''), coalesce(p_guest_vip, false), nullif(trim(p_id_document_url), ''))
  returning id into v_guest_id;

  insert into reservations (property_id, room_id, guest_id, check_in, check_out, party_size, status, source)
  values (
    p_property_id, p_room_id, v_guest_id, now(),
    coalesce(p_check_out, now() + interval '1 day'),
    greatest(coalesce(p_party_size, 1), 1),
    'checked_in', 'built_in'
  )
  returning id into v_reservation_id;

  update rooms set status = case when coalesce(p_guest_vip, false) then 'occupied_vip' else 'occupied' end
    where id = p_room_id;

  return v_reservation_id;
end;
$$;

revoke execute on function staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, int) from public;
grant execute on function staff_checkin_new_guest(text, text, text, text, text, boolean, text, timestamptz, int) to authenticated;
