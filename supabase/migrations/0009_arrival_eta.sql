-- Real delay tracking for upcoming arrivals. Before this, UpcomingArrival.isDelayed
-- was hardcoded false in staffApi.ts because there was no "expected vs
-- actual" signal to compute it from — a guest running late just silently
-- sat in the arrivals list looking on-time. `check_in` is the original
-- booked time; `updated_eta`, once Reception sets it (a guest calls ahead:
-- "running about an hour late"), becomes the time delay is measured
-- against instead. Apply after 0001-0008.

alter table reservations add column if not exists updated_eta timestamptz;

-- Reception updating a guest's ETA touches only this one column, but goes
-- through a function (not a bare client .update()) so it can enforce the
-- same "only for a reservation you're staff on, and only while it's still
-- upcoming" rule staff_check_in_reservation already enforces for check-in.
create or replace function staff_update_arrival_eta(p_reservation_id uuid, p_new_eta timestamptz)
returns void
language plpgsql
as $$
declare
  v_reservation reservations%rowtype;
begin
  select * into v_reservation from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reservation not found';
  end if;
  if not is_staff_for_property(v_reservation.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_reservation.status <> 'upcoming' then
    raise exception 'Can only update ETA for an upcoming arrival';
  end if;

  update reservations set updated_eta = p_new_eta where id = p_reservation_id;
end;
$$;

grant execute on function staff_update_arrival_eta(uuid, timestamptz) to authenticated;
