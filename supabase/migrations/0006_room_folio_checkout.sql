-- Room folio + checkout settlement. Guests already accrue charges on
-- folio_charges (room service orders since 0001; experience bookings were
-- silently NOT posting a charge — fixed below). What was missing is the
-- other end: a way for Reception to see a stay's running bill and settle it
-- as one payment when the guest checks out, the way a real hotel folio
-- works (everything lands on the room, one bill at the end). Apply after
-- 0001-0005.

alter table folio_charges add column if not exists settled_at timestamptz;
alter table folio_charges add column if not exists payment_method text
  check (payment_method in ('cash', 'card', 'upi', 'other'));

alter table reservations add column if not exists checked_out_at timestamptz;

create index if not exists idx_folio_reservation_unsettled on folio_charges(reservation_id) where settled_at is null;

-- guest_book_experience() took a price but never posted it to the folio —
-- a booked spa treatment or tour was invisible to the room bill. Same
-- transactional guarantee as guest_place_order(): the booking and its
-- charge are created together.
create or replace function guest_book_experience(p_token uuid, p_experience_name text, p_price numeric default 0)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_id uuid;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  insert into experience_bookings (property_id, reservation_id, experience_name, price)
  values (v_reservation.property_id, v_reservation.id, p_experience_name, p_price)
  returning id into v_id;

  if coalesce(p_price, 0) > 0 then
    insert into folio_charges (property_id, reservation_id, description, amount, category)
    values (v_reservation.property_id, v_reservation.id, p_experience_name, p_price, 'other');
  end if;

  return v_id;
end;
$$;

grant execute on function guest_book_experience(uuid, text, numeric) to anon;

-- Everything Reception needs to show a room's bill: who's staying, since
-- when, every unsettled line item, and the total. SECURITY INVOKER — RLS on
-- folio_charges/reservations already scopes this to the caller's own
-- properties; this just shapes the read.
create or replace function staff_get_folio(p_reservation_id uuid)
returns jsonb
language plpgsql
stable
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

  return jsonb_build_object(
    'reservationId', v_reservation.id,
    'status', v_reservation.status,
    'checkIn', v_reservation.check_in,
    'checkOut', v_reservation.check_out,
    'charges', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'description', description, 'amount', amount, 'category', category,
        'postedAt', posted_at, 'settled', settled_at is not null
      ) order by posted_at), '[]'::jsonb)
      from folio_charges where reservation_id = p_reservation_id
    ),
    'totalOutstanding', (
      select coalesce(sum(amount), 0) from folio_charges
      where reservation_id = p_reservation_id and settled_at is null
    ),
    'totalPaid', (
      select coalesce(sum(amount), 0) from folio_charges
      where reservation_id = p_reservation_id and settled_at is not null
    )
  );
end;
$$;

revoke execute on function staff_get_folio(uuid) from public;
grant execute on function staff_get_folio(uuid) to authenticated;

-- Settles every outstanding folio charge in one payment and closes out the
-- stay — a real checkout, not just a UI state flip. SECURITY DEFINER
-- because it needs to UPDATE folio_charges, which today only grants staff a
-- `select` policy (charges are meant to be posted by the guest_* functions,
-- not edited freely by staff); this is the one sanctioned write path.
create or replace function staff_checkout_reservation(p_reservation_id uuid, p_payment_method text default 'cash')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_total numeric(10, 2);
begin
  select * into v_reservation from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reservation not found';
  end if;
  if not is_staff_for_property(v_reservation.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if v_reservation.status <> 'checked_in' then
    raise exception 'Reservation is not currently checked in';
  end if;
  if p_payment_method not in ('cash', 'card', 'upi', 'other') then
    raise exception 'Invalid payment method: %', p_payment_method;
  end if;

  select coalesce(sum(amount), 0) into v_total
  from folio_charges where reservation_id = p_reservation_id and settled_at is null;

  update folio_charges set settled_at = now(), payment_method = p_payment_method
  where reservation_id = p_reservation_id and settled_at is null;

  update reservations set status = 'checked_out', checked_out_at = now()
  where id = p_reservation_id;

  -- Checkout doesn't clean itself — the room goes to 'dirty' so it shows up
  -- for housekeeping, same as a guest checking out always has in Reception.
  update rooms set status = 'dirty' where id = v_reservation.room_id;

  return jsonb_build_object('reservationId', p_reservation_id, 'amountCharged', v_total, 'paymentMethod', p_payment_method);
end;
$$;

revoke execute on function staff_checkout_reservation(uuid, text) from public;
grant execute on function staff_checkout_reservation(uuid, text) to authenticated;
