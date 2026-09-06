-- Adds the operational fields Reception's room grid needs (housekeeping
-- notes, cleaning progress, maintenance ETA/issue) and a transactional
-- check-in function, so /reception can move off local mock state for rooms
-- and arrivals. Apply after 0001_init.sql.

alter table rooms add column notes text;
alter table rooms add column clean_progress integer;
alter table rooms add column maintenance_eta text;
alter table rooms add column issue_description text;

-- Checking a guest in touches two tables (the reservation and the room) and
-- must not leave them half-updated, so it's one function rather than two
-- client-side .update() calls. SECURITY INVOKER (the default) — it relies
-- on the caller's own RLS grants for the actual writes, and only adds the
-- is_staff_for_property check so a blocked write fails loudly instead of
-- silently affecting zero rows.
create or replace function staff_check_in_reservation(p_reservation_id uuid)
returns void
language plpgsql
as $$
declare
  v_reservation reservations%rowtype;
  v_is_vip boolean;
begin
  select * into v_reservation from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reservation not found';
  end if;
  if not is_staff_for_property(v_reservation.property_id) then
    raise exception 'Not authorized for this property';
  end if;

  update reservations set status = 'checked_in' where id = p_reservation_id;

  select vip into v_is_vip from guests where id = v_reservation.guest_id;
  update rooms set status = case when coalesce(v_is_vip, false) then 'occupied_vip' else 'occupied' end
    where id = v_reservation.room_id;
end;
$$;

grant execute on function staff_check_in_reservation(uuid) to authenticated;
