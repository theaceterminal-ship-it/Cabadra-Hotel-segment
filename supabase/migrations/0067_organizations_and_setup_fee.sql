-- Paid onboarding: an owner's business (organizations) and a one-time
-- setup fee per property, paid through Razorpay before the property exists.
--
-- The rule this migration enforces: no client can create a property by
-- itself any more. staff_create_property is revoked from signed-in users;
-- the only way a property gets created is fulfil_setup_payment, which only
-- the service_role can call, and which only the verify-setup-payment Edge
-- Function calls, after it has checked the Razorpay signature and the
-- payment's amount and order with Razorpay itself.
--
-- Flow: create-setup-order (Edge Function) inserts a property_setup_payments
-- row holding the property form as a draft and creates the Razorpay order
-- → the browser opens Razorpay Checkout → verify-setup-payment confirms
-- the payment and calls fulfil_setup_payment, which creates the property
-- from the draft and makes the payer its owner. Idempotent: verifying the
-- same order twice returns the same property.
--
-- Properties created before this migration keep working and have no
-- organization_id; nothing here charges for them retroactively.
-- Apply after 0001-0066.

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  owner_name text not null check (char_length(trim(owner_name)) between 1 and 120),
  phone text not null check (char_length(trim(phone)) between 6 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table organizations is
  'The business behind one or more properties — one per owner account, filled in on the onboarding screen before the first property is paid for.';

alter table organizations enable row level security;

drop policy if exists organizations_owner_select on organizations;
create policy organizations_owner_select on organizations
  for select using (owner_user_id = auth.uid());

drop policy if exists organizations_owner_insert on organizations;
create policy organizations_owner_insert on organizations
  for insert with check (owner_user_id = auth.uid());

drop policy if exists organizations_owner_update on organizations;
create policy organizations_owner_update on organizations
  for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

alter table properties
  add column if not exists organization_id uuid references organizations(id) on delete set null;

create table if not exists property_setup_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',
  -- The property form as submitted, created for real only once paid.
  property_draft jsonb not null,
  razorpay_order_id text unique,
  razorpay_payment_id text,
  status text not null default 'created' check (status in ('created', 'paid')),
  property_id text references properties(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

comment on table property_setup_payments is
  'One row per setup-fee checkout. Written only by the create-setup-order / verify-setup-payment Edge Functions (service_role); owners can read their own rows.';

create index if not exists property_setup_payments_user_status_idx
  on property_setup_payments (user_id, status, created_at desc);

alter table property_setup_payments enable row level security;

-- Read-only for the payer (the dashboard uses it to finish a checkout whose
-- tab was closed mid-payment). No insert/update policy on purpose: only
-- the service_role writes here.
drop policy if exists property_setup_payments_owner_select on property_setup_payments;
create policy property_setup_payments_owner_select on property_setup_payments
  for select using (user_id = auth.uid());

-- Turns a confirmed payment into a property. Only the service_role may call
-- it — the Edge Function has already verified the payment with Razorpay.
create or replace function fulfil_setup_payment(p_order_id text, p_payment_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment property_setup_payments%rowtype;
  v_draft jsonb;
  v_base text;
  v_id text;
  v_suffix integer := 1;
begin
  select * into v_payment
  from property_setup_payments
  where razorpay_order_id = p_order_id
  for update;

  if v_payment.id is null then
    raise exception 'Unknown setup-fee order %', p_order_id;
  end if;

  -- Already fulfilled (a retry, or the dashboard's catch-up check racing
  -- the checkout callback): hand back the same property.
  if v_payment.status = 'paid' then
    return v_payment.property_id;
  end if;

  v_draft := v_payment.property_draft;

  -- Same slug shape the old client-side form produced, made unique here
  -- instead of failing on a name another hotel already took.
  v_base := trim(both '-' from regexp_replace(lower(coalesce(v_draft->>'name', '')), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then
    v_base := 'property';
  end if;
  v_id := v_base;
  while exists (select 1 from properties where id = v_id) loop
    v_suffix := v_suffix + 1;
    v_id := v_base || '-' || v_suffix;
  end loop;

  insert into properties (
    id, name, location, status, image, country, currency, has_external_pms, pms_name, organization_id
  )
  values (
    v_id,
    trim(v_draft->>'name'),
    coalesce(nullif(trim(v_draft->>'location'), ''), 'Location TBD'),
    'active',
    nullif(trim(v_draft->>'image'), ''),
    nullif(trim(v_draft->>'country'), ''),
    coalesce(nullif(trim(v_draft->>'currency'), ''), 'INR'),
    coalesce((v_draft->>'hasExternalPms')::boolean, false),
    nullif(trim(v_draft->>'pmsName'), ''),
    v_payment.organization_id
  );

  insert into staff_properties (user_id, property_id, role)
  values (v_payment.user_id, v_id, 'owner');

  update property_setup_payments
  set status = 'paid',
      razorpay_payment_id = p_payment_id,
      paid_at = now(),
      property_id = v_id
  where id = v_payment.id;

  return v_id;
end;
$$;

revoke execute on function fulfil_setup_payment(text, text) from public, anon, authenticated;
grant execute on function fulfil_setup_payment(text, text) to service_role;

-- Property creation now goes through payment only.
revoke execute on function staff_create_property(text, text, text, text, text, text, boolean, text) from authenticated;
