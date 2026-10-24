-- Password setup by email (sent with Resend) instead of password fields in
-- sign-up. New owners sign up with Google only; once their first property
-- is paid for, verify-setup-payment emails them a link to set a password,
-- so they can also sign in with email + password. Anyone can ask for a
-- fresh link from the sign-in page (send-password-link).
-- Apply after 0001-0069.

-- When the "your account is ready, set a password" email went out, so it
-- is sent once per owner, not once per property.
alter table organizations
  add column if not exists password_email_sent_at timestamptz;

-- Throttles send-password-link per account. Service role only.
create table if not exists password_link_sends (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists password_link_sends_user_idx on password_link_sends (user_id, sent_at desc);

alter table password_link_sends enable row level security;

-- send-password-link starts from an email address; the Admin API has no
-- direct lookup by email, so this does it. Service role only, and the
-- function never tells the caller whether an account exists.
create or replace function system_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
$$;

revoke all on function system_user_id_by_email(text) from public, anon, authenticated;
grant execute on function system_user_id_by_email(text) to service_role;
