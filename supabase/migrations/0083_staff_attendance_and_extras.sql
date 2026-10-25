-- Staff: a personal welcome on the shift screen, attendance for payouts,
-- and reports that fit how a hotel uses Cabadra.
--
--   * staff_directory.job_title (optional, "Supervisor"): shown under the
--     staff member's name on the department screen's welcome card.
--   * The department screen (department_display_resolve) and a badge scan
--     (department_display_scan_badge) return the job title and department,
--     so the screen can greet whoever just clocked in by name.
--   * Fix: the badge scan picked the current shift with now()::time, which
--     is UTC on the database: before 5:30 am in India it matched the wrong
--     shift or none. Shifts are entered in hotel (India) time.
--   * owner_staff_attendance: who clocked in and out (badge scans,
--     display_sessions), hours per day, late against their shift's start,
--     days with no clock-in, and a session never clocked out (capped at 12
--     hours and flagged) for a range: what an owner pays wages from.
--   * staff_extras_report: what a hotel earns and does through Cabadra
--     beyond rooms: food orders and top dishes, services and experiences,
--     requests and how fast they're resolved, and suggestion take-up. For a
--     hotel that runs another PMS, this is its whole report; for a hotel on
--     Cabadra's own PMS it sits under the rooms report.
-- Apply after 0001-0082.

alter table staff_directory add column if not exists job_title text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_directory_job_title_length') then
    alter table staff_directory add constraint staff_directory_job_title_length check (length(job_title) <= 60);
  end if;
end $$;

create or replace function department_display_resolve(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display department_displays%rowtype;
  v_property_name text;
  v_property_image text;
  v_tasks jsonb;
  v_active record;
begin
  select * into v_display from department_displays where token = p_token and active;
  if not found then
    raise exception 'This display link is invalid or has been revoked.';
  end if;

  update department_displays set last_used_at = now() where id = v_display.id;
  select name, image into v_property_name, v_property_image from properties where id = v_display.property_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.title, 'description', t.description, 'roomLabel', t.room_label,
    'priority', t.priority, 'status', t.status, 'assignedTo', t.assigned_to,
    'dueLabel', t.due_label, 'rejectionNote', t.rejection_note
  ) order by t.created_at desc), '[]'::jsonb)
  into v_tasks
  from tasks t
  where t.property_id = v_display.property_id and t.category = v_display.department and t.status in ('pending', 'in_progress');

  select sd.name, sd.job_title, ds.claimed_at, sh.name as shift_name into v_active
  from display_sessions ds
  join staff_directory sd on sd.id = ds.staff_directory_id
  left join shifts sh on sh.id = ds.shift_id
  where ds.department_display_id = v_display.id and ds.released_at is null
  order by ds.claimed_at desc
  limit 1;

  return jsonb_build_object(
    'propertyName', coalesce(v_property_name, ''),
    'propertyImage', v_property_image,
    'department', v_display.department,
    'label', v_display.label,
    'tasks', v_tasks,
    'activeStaffName', v_active.name,
    'activeStaffTitle', v_active.job_title,
    'activeShiftName', v_active.shift_name,
    'activeSince', v_active.claimed_at
  );
end;
$$;

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
  v_had_prior_session boolean;
  v_shift_id uuid;
  v_shift_name text;
  v_new display_sessions%rowtype;
  v_local_time time := (now() at time zone 'Asia/Kolkata')::time;
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
  v_had_prior_session := found;

  if v_had_prior_session and v_active.staff_directory_id = v_staff.id then
    -- A repeat scan within 20 seconds of the original claim is almost
    -- certainly an accidental duplicate, not "I'm done for the day".
    if now() - v_active.claimed_at < interval '20 seconds' then
      return jsonb_build_object('action', 'claimed', 'staffName', v_staff.name, 'jobTitle', v_staff.job_title,
                                'department', v_staff.department, 'claimedAt', v_active.claimed_at);
    end if;
    update display_sessions set released_at = now() where id = v_active.id;
    return jsonb_build_object('action', 'released', 'staffName', v_staff.name, 'jobTitle', v_staff.job_title,
                              'department', v_staff.department, 'claimedAt', v_active.claimed_at, 'releasedAt', now());
  end if;

  if v_had_prior_session then
    update display_sessions set released_at = now() where id = v_active.id;
  end if;

  -- Shifts are in hotel time; end <= start crosses midnight.
  select id, name into v_shift_id, v_shift_name
  from shifts
  where property_id = v_display.property_id and department = v_display.department and active
    and (
      (start_time <= end_time and v_local_time between start_time and end_time)
      or (start_time > end_time and (v_local_time >= start_time or v_local_time < end_time))
    )
  limit 1;

  insert into display_sessions (property_id, department_display_id, staff_directory_id, shift_id)
  values (v_display.property_id, v_display.id, v_staff.id, v_shift_id)
  returning * into v_new;

  update department_displays set last_used_at = now() where id = v_display.id;

  return jsonb_build_object(
    'action', case when v_had_prior_session then 'handover' else 'claimed' end,
    'staffName', v_staff.name, 'jobTitle', v_staff.job_title, 'department', v_staff.department,
    'shiftName', v_shift_name, 'claimedAt', v_new.claimed_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
create or replace function owner_staff_attendance(p_property_id text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_last date := least(p_to, (now() at time zone 'Asia/Kolkata')::date);
begin
  if not is_owner_for_property(p_property_id) then
    raise exception 'Only the owner can see attendance';
  end if;
  if p_to < p_from or p_to - p_from > 92 then
    raise exception 'Pick a range of up to three months';
  end if;

  return (
    with sessions as (
      select ds.staff_directory_id as staff_id,
             (ds.claimed_at at time zone 'Asia/Kolkata')::date as day,
             ds.claimed_at, ds.released_at,
             -- Never clocked out: still on if it's today, otherwise capped at 12 hours and flagged.
             case
               when ds.released_at is not null then ds.released_at
               when (ds.claimed_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date then now()
               else least(now(), ds.claimed_at + interval '12 hours')
             end as ended_at,
             ds.released_at is null and (ds.claimed_at at time zone 'Asia/Kolkata')::date < (now() at time zone 'Asia/Kolkata')::date as missed_clock_out,
             sh.start_time, sh.name as shift_name
      from display_sessions ds
      left join shifts sh on sh.id = ds.shift_id
      where ds.property_id = p_property_id
        and (ds.claimed_at at time zone 'Asia/Kolkata')::date between p_from and p_to
    ),
    daily as (
      select staff_id, day,
             min(claimed_at) as first_in,
             max(ended_at) as last_out,
             round(sum(extract(epoch from (ended_at - claimed_at)) / 60)) as minutes,
             bool_or(missed_clock_out) as missed_clock_out,
             bool_or(released_at is null and not missed_clock_out) as on_now,
             min(shift_name) as shift_name,
             -- Late: first clock-in more than 10 minutes after that shift's start (hotel time).
             bool_or(start_time is not null and (claimed_at at time zone 'Asia/Kolkata')::time > start_time + interval '10 minutes'
                     and (claimed_at at time zone 'Asia/Kolkata')::time < start_time + interval '6 hours') as late
      from sessions
      group by staff_id, day
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'staffId', sd.id, 'name', sd.name, 'department', sd.department, 'jobTitle', sd.job_title, 'phone', sd.phone,
      'days', coalesce((
        select jsonb_agg(jsonb_build_object(
          'date', d.day, 'firstIn', d.first_in, 'lastOut', d.last_out, 'minutes', d.minutes,
          'late', d.late, 'missedClockOut', d.missed_clock_out, 'onNow', d.on_now, 'shiftName', d.shift_name
        ) order by d.day)
        from daily d where d.staff_id = sd.id
      ), '[]'::jsonb),
      'daysPresent', (select count(*) from daily d where d.staff_id = sd.id),
      'daysAbsent', greatest((v_last - greatest(p_from, (sd.created_at at time zone 'Asia/Kolkata')::date) + 1)
                             - (select count(*) from daily d where d.staff_id = sd.id and d.day <= v_last), 0),
      'minutes', coalesce((select sum(d.minutes) from daily d where d.staff_id = sd.id), 0),
      'lateDays', (select count(*) from daily d where d.staff_id = sd.id and d.late),
      'missedClockOuts', (select count(*) from daily d where d.staff_id = sd.id and d.missed_clock_out),
      'onShiftNow', exists (select 1 from daily d where d.staff_id = sd.id and d.on_now)
    ) order by sd.department, sd.name), '[]'::jsonb)
    from staff_directory sd
    where sd.property_id = p_property_id
  );
end;
$$;
revoke all on function owner_staff_attendance(text, date, date) from public, anon;
grant execute on function owner_staff_attendance(text, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- What the hotel does through Cabadra, beyond rooms
-- ---------------------------------------------------------------------------
create or replace function staff_extras_report(p_property_id text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Pick a range of up to a year';
  end if;

  return (
    with o as (
      select * from orders
      where property_id = p_property_id and status <> 'rejected'
        and (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
    ),
    lines as (
      select l->>'name' as name, coalesce((l->>'quantity')::numeric, 1) as qty,
             coalesce((l->>'price')::numeric, 0) * coalesce((l->>'quantity')::numeric, 1) as revenue
      from o, jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) l
    ),
    rq as (
      select * from guest_requests
      where property_id = p_property_id and (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
    ),
    ex as (
      select * from experience_bookings
      where property_id = p_property_id and status <> 'cancelled'
        and (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
    ),
    oe as (
      select * from offer_events
      where property_id = p_property_id and (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
    )
    select jsonb_build_object(
      'orders', jsonb_build_object(
        'count', (select count(*) from o),
        'revenue', (select coalesce(sum(total_amount), 0) from o),
        'average', (select coalesce(round(avg(total_amount), 2), 0) from o),
        'rejected', (select count(*) from orders where property_id = p_property_id and status = 'rejected'
                     and (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
        'roomsOrdering', (select count(distinct reservation_id) from o)
      ),
      'topItems', (
        select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', revenue) order by revenue desc), '[]'::jsonb)
        from (select name, sum(qty) as qty, sum(revenue) as revenue from lines group by name order by sum(revenue) desc limit 8) t
      ),
      'requests', jsonb_build_object(
        'count', (select count(*) from rq),
        'resolved', (select count(*) from rq where status = 'resolved'),
        'open', (select count(*) from rq where status = 'open'),
        'avgMinutesToResolve', (select coalesce(round(avg(extract(epoch from (resolved_at - created_at)) / 60)), 0) from rq where resolved_at is not null),
        'paidRevenue', (select coalesce(sum(price), 0) from rq where price is not null and status = 'resolved'),
        'byDepartment', (select coalesce(jsonb_object_agg(department, n), '{}'::jsonb) from (select department, count(*) n from rq group by department) x)
      ),
      'experiences', jsonb_build_object(
        'count', (select count(*) from ex),
        'revenue', (select coalesce(sum(price), 0) from ex),
        'guests', (select coalesce(sum(guest_count), 0) from ex)
      ),
      'suggestions', jsonb_build_object(
        'shown', (select count(*) from oe where event = 'impression'),
        'taken', (select count(*) from oe where event = 'action')
      )
    )
  );
end;
$$;
revoke all on function staff_extras_report(text, date, date) from public, anon;
grant execute on function staff_extras_report(text, date, date) to authenticated;
