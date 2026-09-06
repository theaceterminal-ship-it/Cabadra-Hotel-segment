-- Also fixes a real, previously-silent bug found while writing this: the
-- `properties` table has only ever had a SELECT RLS policy (0001_init.sql)
-- — never UPDATE. staffApi.ts's updateProperty() has been calling a plain
-- client .update() since it was written (used by the Property Photo save
-- button); under RLS with no UPDATE policy, that doesn't error, it just
-- silently matches zero rows. Every property-photo save this whole build
-- has quietly done nothing. Confirmed live: an authenticated client update
-- against `properties` with no matching policy affects 0 rows without
-- throwing — the classic silent-RLS-gap symptom. Fixed below with a real
-- owner-scoped UPDATE policy, which also means upi_id can be a plain
-- column update instead of needing its own narrow function.
--
-- Folio settlement wasn't always going to be "one lump sum at checkout" —
-- a deposit taken at check-in, or a UPI payment collected mid-stay, needs
-- to reduce the running balance *as it happens*, not just get remembered
-- separately. This reuses folio_charges exactly as-is: a payment received
-- is a negative-amount row in the same table, same "unsettled" bucket, so
-- it nets against real charges automatically and gets swept up in the
-- same staff_checkout_reservation batch at the end. No parallel ledger.
--
-- Also adds a UPI ID the owner can set once, so Reception (or the guest,
-- for room-service payment) can show/scan a QR without re-typing it every
-- time — same idea as this app's own PLATFORM_UPI_ID pattern in the
-- sibling tableorder product, one level up: this is the *property's*
-- UPI id, not the platform's.
--
-- Apply after 0001-0020.

alter table properties add column if not exists upi_id text;

-- The actual fix: owners can now update their own property row at all.
-- (Reception isn't included on purpose — payment settings and the
-- property photo/name/location are owner-level configuration.)
create policy "owners can update their properties" on properties
  for update using (is_owner_for_property(id)) with check (is_owner_for_property(id));

alter table folio_charges drop constraint if exists folio_charges_category_check;
alter table folio_charges add constraint folio_charges_category_check
  check (category in ('room_service', 'spa', 'laundry', 'minibar', 'deposit', 'other'));

-- A negative amount is deliberate — see the header comment. Recorded as
-- its own row (not folded into an existing charge) so the folio timeline
-- shows exactly when and how each payment came in, same as any other line.
create or replace function staff_record_folio_payment(
  p_reservation_id uuid, p_amount numeric, p_description text, p_method text
)
returns void
language plpgsql
security definer
set search_path = public
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
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;
  if p_method not in ('cash', 'card', 'upi', 'other') then
    raise exception 'Invalid payment method: %', p_method;
  end if;

  insert into folio_charges (property_id, reservation_id, description, amount, category, payment_method)
  values (v_reservation.property_id, p_reservation_id, coalesce(nullif(trim(p_description), ''), 'Payment received'), -abs(p_amount), 'deposit', p_method);
end;
$$;

revoke execute on function staff_record_folio_payment(uuid, numeric, text, text) from public;
grant execute on function staff_record_folio_payment(uuid, numeric, text, text) to authenticated;

-- Checkout settling every unsettled row shouldn't overwrite a payment's
-- *own* recorded method (a deposit taken via UPI stays UPI in the record
-- even though the balance is settled in cash) — only fill in payment_method
-- where it isn't already set.
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

  update folio_charges set settled_at = now(), payment_method = coalesce(payment_method, p_payment_method)
  where reservation_id = p_reservation_id and settled_at is null;

  update reservations set status = 'checked_out', checked_out_at = now()
  where id = p_reservation_id;

  update rooms set status = 'dirty' where id = v_reservation.room_id;

  return jsonb_build_object('reservationId', p_reservation_id, 'amountCharged', v_total, 'paymentMethod', p_payment_method);
end;
$$;

revoke execute on function staff_checkout_reservation(uuid, text) from public;
grant execute on function staff_checkout_reservation(uuid, text) to authenticated;

-- With the UPDATE policy above in place, updateProperty()'s existing plain
-- client .update() now genuinely works — upi_id is just one more field it
-- can patch, same as image/name/location/status already were meant to.
