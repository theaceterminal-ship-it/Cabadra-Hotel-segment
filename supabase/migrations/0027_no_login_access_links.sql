-- One-tap reception access: instead of a receptionist needing their own
-- email/password account, the owner generates a single permanent link for
-- the property. Opening it silently signs the browser in as a dedicated,
-- shared "reception" account for that property — no login form, no
-- password, ever. The actual sign-in still goes through real Supabase Auth
-- underneath (via a fresh one-time magic link minted server-side on every
-- open — see supabase/functions/redeem-access-link), so every existing
-- RLS policy and is_staff_for_property() check keeps working unchanged.
-- This table is just "which dedicated account does this token map to."
--
-- Trade-off, deliberate: every device with the link has full reception
-- access, and actions are attributed to one shared account, not a named
-- person. That's the point (no account management), not an oversight —
-- named, individually-revocable logins are still available via the
-- existing Staff tab invite flow for anyone who wants that instead.
--
-- Apply after 0001-0026.

create table property_access_links (
  id uuid primary key default gen_random_uuid(),  -- the token itself, used directly as /access/:id
  property_id text not null references properties(id) on delete cascade,
  role text not null check (role in ('receptionist')),
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (property_id, role)
);

alter table property_access_links enable row level security;

-- Owners can see (and copy) their own property's link directly from the
-- client — only creating/regenerating one goes through the Edge Function,
-- since that's the step that needs the Admin API.
create policy "owners can view their property's access links" on property_access_links
  for select using (is_owner_for_property(property_id));

create index idx_access_links_property on property_access_links(property_id);

revoke all on property_access_links from anon;
grant select on property_access_links to authenticated;
