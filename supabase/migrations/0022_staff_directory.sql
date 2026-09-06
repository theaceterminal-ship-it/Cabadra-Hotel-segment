-- A phone-number directory per department, deliberately separate from
-- staff_properties (the login-based access-control table). Most of the
-- people Reception needs to reach for a Live Ops task — a housekeeping
-- attendant, an on-call electrician — don't need or want a Cabadra login
-- at all; they need to be reachable by phone when a task comes in. This is
-- that contact list, and what a task's "Assign to" now actually assigns to.
-- Apply after 0001-0021.

create table staff_directory (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  name text not null,
  phone text not null,
  department text not null check (department in ('housekeeping', 'maintenance', 'amenities', 'concierge')),
  created_at timestamptz not null default now()
);

alter table staff_directory enable row level security;

create policy "staff can manage the directory on their property" on staff_directory
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create index idx_staff_directory_property on staff_directory(property_id, department);
