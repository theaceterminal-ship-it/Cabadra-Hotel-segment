-- Owners sign up with Google, so most have no password. The browser
-- can't see whether one is set (auth.users isn't exposed), so this
-- answers that one question for the signed-in user only.
-- verify-setup-payment calls it with the owner's own token to decide
-- whether to email a "set a password" link (0070).
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
