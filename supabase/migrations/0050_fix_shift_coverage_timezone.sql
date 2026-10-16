-- Found live-testing against a real Shimla property: a shift entered as
-- 08:00-20:00 (meant as 8am-8pm India time, same wall clock a receptionist
-- reads off the Shift Coverage form) computed its window as 08:00-20:00
-- UTC instead — 13:30-01:30 IST. A staff member who scanned in at 5:17pm
-- local time, comfortably inside an 8am-8pm shift, showed as a "late
-- start" against a window that didn't open (in IST) until 1:30pm.
--
-- Root cause: `v_window_start timestamptz := p_date + s.start_time` casts
-- a naive timestamp (date + time, no zone) to timestamptz using the
-- database SESSION's timezone — UTC on Supabase by default — not the
-- hotel's own local time. There's no properties.timezone column to read
-- instead (a real gap worth adding once Cabadra operates outside India),
-- so this hardcodes Asia/Kolkata, matching the only properties that exist
-- today. Apply after 0001-0049.

create or replace function staff_shift_coverage(p_property_id text, p_department text, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grace constant interval := interval '15 minutes';
  v_tz constant text := 'Asia/Kolkata';
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
    v_window_start := (p_date + s.start_time) at time zone v_tz;
    v_window_end := case when s.end_time <= s.start_time
                     then (p_date + 1 + s.end_time) at time zone v_tz
                     else (p_date + s.end_time) at time zone v_tz end;

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

-- Same bug, same fix, in the scan function's own shift-matching: now()::time
-- extracts the session's (UTC) clock time, not India's, so a scan was being
-- matched against shift windows 5.5 hours off from what the staff member
-- actually experiences.
create or replace function department_display_scan_badge(p_display_token uuid, p_badge_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz constant text := 'Asia/Kolkata';
  v_display department_displays%rowtype;
  v_staff staff_directory%rowtype;
  v_active display_sessions%rowtype;
  v_had_prior_session boolean;
  v_shift_id uuid;
  v_shift_name text;
  v_local_time time;
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
  v_had_prior_session := found;

  if v_had_prior_session and v_active.staff_directory_id = v_staff.id then
    update display_sessions set released_at = now() where id = v_active.id;
    return jsonb_build_object('action', 'released', 'staffName', v_staff.name);
  end if;

  if v_had_prior_session then
    update display_sessions set released_at = now() where id = v_active.id;
  end if;

  -- end_time <= start_time crosses midnight: "now" matches if it's at or
  -- after start, OR before end (not a plain between).
  v_local_time := (now() at time zone v_tz)::time;
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
    'staffName', v_staff.name, 'shiftName', v_shift_name, 'claimedAt', v_new.claimed_at
  );
end;
$$;

grant execute on function department_display_scan_badge(uuid, uuid) to anon;
