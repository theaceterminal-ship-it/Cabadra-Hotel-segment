-- Found live-testing: a badge scan would correctly show "Priya clocked
-- in", then within seconds flip back to clocked out on its own — and
-- Reception's "On Shift Now" card (0053) showed nobody, because the
-- display_sessions row really had been released that fast. Root cause:
-- department_display_scan_badge (0047, relabeled 0049) treats ANY second
-- scan of the same badge while it's still active as "I'm leaving" and
-- releases it — correct for a deliberate end-of-shift scan, but it has no
-- way to tell that apart from an accidental duplicate (a camera
-- re-reading the same frame before QrScannerModal's camera stream fully
-- stops, a flaky retry, the staff member scanning again because they
-- weren't sure the first one registered). A real shift lasts minutes to
-- hours, not seconds, so a repeat scan within a short window is treated
-- as a no-op instead of a release. Apply after 0001-0053.

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
    -- certainly an accidental duplicate, not "I'm done for the day" —
    -- stays claimed instead of releasing.
    if now() - v_active.claimed_at < interval '20 seconds' then
      return jsonb_build_object('action', 'claimed', 'staffName', v_staff.name, 'claimedAt', v_active.claimed_at);
    end if;
    update display_sessions set released_at = now() where id = v_active.id;
    return jsonb_build_object('action', 'released', 'staffName', v_staff.name);
  end if;

  if v_had_prior_session then
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
    'action', case when v_had_prior_session then 'handover' else 'claimed' end,
    'staffName', v_staff.name, 'shiftName', v_shift_name, 'claimedAt', v_new.claimed_at
  );
end;
$$;
