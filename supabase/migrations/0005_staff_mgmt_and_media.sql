-- Adds: room/property photo URLs, and self-serve staff management (an
-- owner granting/revoking access by email instead of writing SQL). Apply
-- after 0001-0004.

alter table rooms add column if not exists image text;
alter table properties add column if not exists image text;

-- ============================================================================
-- STAFF MANAGEMENT — list / invite / revoke, owner-only for writes
-- ============================================================================

-- auth.users isn't exposed through the REST API (only `public` is), so
-- looking someone up by email — or showing an email next to a role — has to
-- happen inside a SECURITY DEFINER function like this one, not a client
-- query. Readable by any staff member on the property; only owners can
-- write (see staff_invite_by_email / staff_revoke_access below).
create or replace function staff_list_for_property(p_property_id text)
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
    select jsonb_agg(jsonb_build_object('userId', u.id, 'email', u.email, 'role', sp.role) order by sp.created_at)
    from staff_properties sp
    join auth.users u on u.id = sp.user_id
    where sp.property_id = p_property_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function staff_list_for_property(text) from public;
grant execute on function staff_list_for_property(text) to authenticated;

-- Grants access to whoever already has an account with this email — it
-- does NOT create an account (this app has no invite-email flow, so the
-- person still has to sign up themselves first; this function just tells
-- you clearly when that hasn't happened yet instead of silently doing
-- nothing).
create or replace function staff_invite_by_email(p_property_id text, p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only an owner can grant access to this property';
  end if;
  if p_role not in ('owner', 'receptionist') then
    raise exception 'Invalid role: %', p_role;
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email));
  if v_user_id is null then
    return jsonb_build_object(
      'success', false,
      'message', 'No account found for that email yet. Ask them to sign up at /owner or /reception first, then try again.'
    );
  end if;

  insert into staff_properties (user_id, property_id, role)
  values (v_user_id, p_property_id, p_role)
  on conflict (user_id, property_id) do update set role = excluded.role;

  return jsonb_build_object('success', true, 'message', 'Access granted.');
end;
$$;

revoke execute on function staff_invite_by_email(text, text, text) from public;
grant execute on function staff_invite_by_email(text, text, text) to authenticated;

create or replace function staff_revoke_access(p_property_id text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only an owner can revoke access to this property';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Cannot revoke your own access — have another owner do it, so a property can never end up with zero owners by accident';
  end if;
  delete from staff_properties where property_id = p_property_id and user_id = p_user_id;
end;
$$;

revoke execute on function staff_revoke_access(text, uuid) from public;
grant execute on function staff_revoke_access(text, uuid) to authenticated;
