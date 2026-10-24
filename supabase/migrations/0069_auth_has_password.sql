-- Owners who signed up with Google have no password, but every owner
-- account should also work with email + password. The browser can't see
-- whether a password is set (auth.users isn't exposed), so this answers
-- that one question for the signed-in user only. Onboarding uses it to ask
-- Google sign-ups for a password, and the owner dashboard shows an "Add a
-- password" banner to older accounts that don't have one.
-- Apply after 0001-0068.

create or replace function my_auth_has_password()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.encrypted_password is not null and u.encrypted_password <> ''
     from auth.users u
     where u.id = auth.uid()),
    false
  );
$$;

revoke all on function my_auth_has_password() from public, anon;
grant execute on function my_auth_has_password() to authenticated;
