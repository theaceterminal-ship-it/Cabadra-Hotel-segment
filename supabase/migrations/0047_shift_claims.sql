-- Shift Claims (system-design doc, "Shift Claims — Knowing Who's on the
-- Device"): a personal badge scan on a department display claims it for a
-- named staff member, so every accept/complete/reject attributes to an
-- actual person, not just "the housekeeping tablet" — and a coverage
-- report answers "did someone actually show up for this shift." Schema +
-- functions only, same pattern as every other phase in this build; the
-- scan screen and the coverage dashboard are a separate follow-up.
--
-- Stacked on 0046 (department_displays) — apply after that migration.

-- Each staff member's own standing, regenerate-if-lost QR code. Same idiom
-- as every other capability token in this app (guest_token, task_token,
-- department_displays.token) — scanning IS the authorization, no login.
alter table staff_directory add column if not exists badge_token uuid unique default gen_random_uuid();

-- Named, recurring daily windows — "Morning 08:00-20:00", not a calendar.
-- end_time <= start_time means the shift crosses midnight (e.g. Night
-- 20:00-08:00); every window computation below accounts for that.
create table shifts (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  department text not null check (department in ('housekeeping', 'maintenance', 'amenities', 'concierge')),
  name text not null,
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table shifts enable row level security;

create policy "staff can manage shifts on their property" on shifts
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create index idx_shifts_property on shifts(property_id, department);

-- One row per claim. property_id is denormalized (same convention as
-- folio_charges keeping reservation_id's property rather than requiring a
-- join everywhere) so the RLS policy and reporting queries stay simple.
-- released_at null = currently active; at most one active row per display
-- is enforced by the scan function below, not a DB constraint (a partial
-- unique index on (department_display_id) where released_at is null would
-- work too, but the function already guarantees it on every write path —
-- skipped to keep this migration's first pass minimal).
create table display_sessions (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  department_display_id uuid not null references department_displays(id) on delete cascade,
  staff_directory_id uuid not null references staff_directory(id) on delete cascade,
  shift_id uuid references shifts(id) on delete set null,
  claimed_at timestamptz not null default now(),
  released_at timestamptz
);

alter table display_sessions enable row level security;

-- Staff can VIEW their property's sessions (for the coverage report and
-- plain debugging) but never write them directly — every write goes
-- through department_display_scan_badge below, the same way tasks never
-- let a client post a folio charge directly.
create policy "staff can view display sessions on their property" on display_sessions
  for select using (is_staff_for_property(property_id));

create index idx_display_sessions_display on display_sessions(department_display_id, released_at);
create index idx_display_sessions_property on display_sessions(property_id, claimed_at);

revoke all on display_sessions from anon;
revoke all on shifts from anon;

-- The scan action: a badge scanned at a department display. Three
-- outcomes —
--   1. no one active on this display -> claims it
--   2. the SAME badge is active -> releases it (the "I'm done" scan)
--   3. a DIFFERENT badge is active -> releases the outgoing claim and
--      claims it for the new badge (a handover, whether or not the
--      outgoing person remembered to scan themselves out first)
-- Granted to anon: the badge token and the display token together ARE the
-- authorization, no login, same trust tier as every other scan in this app.
create or replace function department_display_scan_badge(p_display_token uuid, p_badge_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display department_displays%rowtype;
  v_staff staff_directory%rowtype;
  v_active display_sessions%rowtype;
  v_shift_id uuid;
  v_shift_name text;
  v_new display_sessions%rowtype;
begin
  select * into v_display from department_displays where token = p_display_token and active;
  if not found then
    raise exception 'This display link is invalid or has been revoked.';
  end if;

  select * into v_staff from staff_directory
  where badge_token = p_badge_token and property_id = v_display.property_id;
  if not found then
    raise exception 'This badge is not recognized for this property.';
  end if;
  if v_staff.department <> v_display.department then
    raise exception '% is not a % staff member', v_staff.name, v_display.department;
  end if;

  select * into v_active from display_sessions
  where department_display_id = v_display.id and released_at is null
  order by claimed_at desc limit 1;

  if found and v_active.staff_directory_id = v_staff.id then
    update display_sessions set released_at = now() where id = v_active.id;
    return jsonb_build_object('action', 'released', 'staffName', v_staff.name);
  end if;

  if found then
    update display_sessions set released_at = now() where id = v_active.id;
  end if;

  -- end_time <= start_time crosses midnight: "now" matches if it's at or
  -- after start, OR before end (not a plain between).
  select id, name into v_shift_id, v_shift_name
  from shifts
  where property_id = v_display.property_id and department = v_display.department and active
    and (
      (start_time <= end_time and now()::time between start_time and end_time)
      or (start_time > end_time and (now()::time >= start_time or now()::time < end_time))
    )
  limit 1;

  insert into display_sessions (property_id, department_display_id, staff_directory_id, shift_id)
  values (v_display.property_id, v_display.id, v_staff.id, v_shift_id)
  returning * into v_new;

  update department_displays set last_used_at = now() where id = v_display.id;

  return jsonb_build_object(
    'action', case when found then 'handover' else 'claimed' end,
    'staffName', v_staff.name, 'shiftName', v_shift_name, 'claimedAt', v_new.claimed_at
  );
end;
$$;

grant execute on function department_display_scan_badge(uuid, uuid) to anon;

-- "Did someone actually show up" — computed on demand, not a live push
-- alert (this app has no scheduled job anywhere yet; a real-time alert the
-- instant a shift goes uncovered needs one, and that's a deliberate later
-- step, not something to half-build here). For each active shift on
-- p_date: 'uncovered' (grace period passed, no claim overlapping the
-- window at all), 'pending' (window hasn't started + grace yet), 'late'
-- (first claim landed after the grace period), 'covered', or 'overrun'
-- (the window has ended but whoever claimed it is still active with
-- nothing relieving them).
create or replace function staff_shift_coverage(p_property_id text, p_department text, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grace constant interval := interval '15 minutes';
  v_result jsonb := '[]'::jsonb;
  s record;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_first_claim timestamptz;
  v_claimed_by text;
  v_still_uncovered_active boolean;
  v_status text;
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;

  for s in
    select * from shifts
    where property_id = p_property_id and department = p_department and active
    order by start_time
  loop
    v_window_start := p_date + s.start_time;
    v_window_end := case when s.end_time <= s.start_time
                     then (p_date + 1) + s.end_time
                     else p_date + s.end_time end;

    select min(ds.claimed_at) into v_first_claim
    from display_sessions ds
    join department_displays dd on dd.id = ds.department_display_id
    where dd.property_id = p_property_id and dd.department = p_department
      and ds.claimed_at < v_window_end
      and coalesce(ds.released_at, now()) > v_window_start;

    select sd.name into v_claimed_by
    from display_sessions ds
    join department_displays dd on dd.id = ds.department_display_id
    join staff_directory sd on sd.id = ds.staff_directory_id
    where dd.property_id = p_property_id and dd.department = p_department
      and ds.claimed_at < v_window_end
      and coalesce(ds.released_at, now()) > v_window_start
    order by ds.claimed_at asc
    limit 1;

    select exists (
      select 1 from display_sessions ds2
      join department_displays dd2 on dd2.id = ds2.department_display_id
      where dd2.property_id = p_property_id and dd2.department = p_department
        and ds2.released_at is null and ds2.claimed_at < v_window_end
    ) into v_still_uncovered_active;

    v_status := case
      when v_first_claim is null and now() > v_window_start + v_grace then 'uncovered'
      when v_first_claim is null then 'pending'
      when now() > v_window_end and v_still_uncovered_active then 'overrun'
      when v_first_claim > v_window_start + v_grace then 'late'
      else 'covered'
    end;

    v_result := v_result || jsonb_build_object(
      'shiftId', s.id, 'shiftName', s.name,
      'windowStart', v_window_start, 'windowEnd', v_window_end,
      'status', v_status, 'claimedBy', v_claimed_by, 'firstClaimAt', v_first_claim
    );
  end loop;

  return v_result;
end;
$$;

revoke execute on function staff_shift_coverage(text, text, date) from public;
grant execute on function staff_shift_coverage(text, text, date) to authenticated;
