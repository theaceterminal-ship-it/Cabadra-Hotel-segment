-- End-to-end staff onboarding for an email with no account yet.
--
-- Why this needs more than SQL: creating a Supabase Auth user and sending
-- them an invite email is an Admin API operation (auth.admin.inviteUserByEmail),
-- which requires the service_role key — a key that must never reach the
-- browser and cannot be called from inside Postgres. So the actual "create
-- the account and email them" step happens in supabase/functions/invite-staff
-- (a server-side Edge Function holding that key). What this migration adds
-- is the other half: a place to park "this email should get property X once
-- they exist" *before* they exist, and a trigger that redeems it the moment
-- their auth.users row is created — which happens synchronously inside
-- admin.inviteUserByEmail, so access is granted immediately, not after they
-- eventually click the email. Apply after 0001-0007.

create table pending_staff_invites (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'receptionist')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (property_id, email)
);

alter table pending_staff_invites enable row level security;

create policy "owners can view pending invites on their property" on pending_staff_invites
  for select using (is_owner_for_property(property_id));

create index idx_pending_invites_email on pending_staff_invites(lower(email));

-- Runs as this migration's owner (postgres), same as every other function
-- here that touches auth.users — a normal authenticated role has no grants
-- on that schema at all, by design.
create or replace function handle_new_user_staff_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into staff_properties (user_id, property_id, role)
  select new.id, pi.property_id, pi.role
  from pending_staff_invites pi
  where lower(pi.email) = lower(new.email)
  on conflict (user_id, property_id) do update set role = excluded.role;

  delete from pending_staff_invites where lower(email) = lower(new.email);

  return new;
end;
$$;

drop trigger if exists trg_handle_new_user_staff_invites on auth.users;
create trigger trg_handle_new_user_staff_invites
  after insert on auth.users
  for each row execute function handle_new_user_staff_invites();

-- Queues an invite for an email with no account — called by the Edge
-- Function right before it calls admin.inviteUserByEmail, and also usable
-- standalone (e.g. someone pre-registers a hire's email before IT sets up
-- their account some other way). Owner-only, same authorization rule as
-- staff_invite_by_email.
create or replace function staff_queue_pending_invite(p_property_id text, p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only an owner can invite staff to this property';
  end if;
  if p_role not in ('owner', 'receptionist') then
    raise exception 'Invalid role: %', p_role;
  end if;
  if exists (select 1 from auth.users where lower(email) = lower(trim(p_email))) then
    raise exception 'That email already has an account — use staff_invite_by_email instead';
  end if;

  insert into pending_staff_invites (property_id, email, role, invited_by)
  values (p_property_id, lower(trim(p_email)), p_role, auth.uid())
  on conflict (property_id, email) do update set role = excluded.role;
end;
$$;

revoke execute on function staff_queue_pending_invite(text, text, text) from public;
grant execute on function staff_queue_pending_invite(text, text, text) to authenticated;

create or replace function staff_cancel_pending_invite(p_property_id text, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only an owner can cancel a pending invite on this property';
  end if;
  delete from pending_staff_invites where property_id = p_property_id and lower(email) = lower(trim(p_email));
end;
$$;

revoke execute on function staff_cancel_pending_invite(text, text) from public;
grant execute on function staff_cancel_pending_invite(text, text) to authenticated;

create or replace function staff_list_pending_invites(p_property_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('email', email, 'role', role, 'createdAt', created_at) order by created_at)
    from pending_staff_invites where property_id = p_property_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function staff_list_pending_invites(text) from public;
grant execute on function staff_list_pending_invites(text) to authenticated;
