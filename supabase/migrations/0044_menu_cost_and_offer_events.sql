-- Phase 1 of the Offer Engine design (system-design doc, "Build Phasing"):
-- instrument before touching ranking or placement, so every later step is
-- measurable from day one. No guest-visible behavior changes in this
-- migration — the UI changes that write to offer_events ship alongside it,
-- but only as background logging, nothing rendered differently.

-- Staff-only cost. Guest reads never select * from menu_items — every
-- guest-facing function (guest_get_context, guest_get_recommendations)
-- builds an explicit jsonb_build_object field list, and anon already has
-- zero table grant on menu_items (0001_init.sql's blanket revoke) — so this
-- column is guest-invisible by construction, the same separation Churmuri
-- keeps between its menu and its staff-only costs. Null = unknown, never
-- default this to 0: an uncosted dish must never silently look free-margin.
alter table menu_items add column if not exists cost numeric(10, 2);

comment on column menu_items.cost is
  'Staff-only; never read by any guest-facing function. Null = unknown, not free — never default this to 0.';

-- One row per offer shown or acted on. offer_id is a free-form id into
-- whichever catalog offer_type names (menu_items.id today; service_catalog
-- or deals ids once those tables exist) — kept as text rather than a typed
-- fk so this table doesn't need a migration every time a new offer_type is
-- added.
create table if not exists offer_events (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  offer_id text not null,
  offer_type text not null check (offer_type in ('menu_item', 'service', 'deal')),
  event text not null check (event in ('impression', 'action')),
  surface text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists offer_events_property_created_idx on offer_events (property_id, created_at desc);
create index if not exists offer_events_offer_idx on offer_events (property_id, offer_type, offer_id);

alter table offer_events enable row level security;

create policy "staff can view offer events on their property" on offer_events
  for select using (is_staff_for_property(property_id));

revoke all on offer_events from anon;

-- Batched so one page load (several impressions at once) is one round trip,
-- not N. Scoped by this stay's token server-side exactly like
-- guest_place_order — a guest can never log an event against a reservation
-- that isn't theirs. Malformed rows in the batch are skipped, not fatal:
-- a logging bug on the client should never be able to break ordering.
create or replace function guest_log_offer_events(p_token uuid, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  insert into offer_events (property_id, reservation_id, offer_id, offer_type, event, surface, context)
  select
    v_reservation.property_id,
    v_reservation.id,
    e->>'offerId',
    coalesce(e->>'offerType', 'menu_item'),
    e->>'event',
    e->>'surface',
    coalesce(e->'context', '{}'::jsonb)
  from jsonb_array_elements(p_events) as e
  where e->>'offerId' is not null
    and e->>'event' in ('impression', 'action')
    and e->>'surface' is not null;
end;
$$;

revoke execute on function guest_log_offer_events(uuid, jsonb) from public;
grant execute on function guest_log_offer_events(uuid, jsonb) to anon;
