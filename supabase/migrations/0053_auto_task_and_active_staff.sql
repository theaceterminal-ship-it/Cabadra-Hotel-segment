-- Found live-testing: a guest's request (guest_submit_request, 0003/0018)
-- only ever wrote to guest_requests — nothing turned it into a tasks row,
-- which is the only thing a department display or the Live Ops board
-- actually queues (department_display_resolve, 0046; fetchTasks). So a
-- housekeeping request never reached Housekeeping's own queue at all,
-- not even after a refresh — there was nothing there to refresh into
-- view. This trigger is the missing link: every guest_requests insert
-- (guest-submitted OR Reception-logged via logStaffRequest) now creates
-- its matching task immediately, tagged to the right department and
-- linked back via guest_request_id (0045) the same way a manually
-- dispatched task already was.
--
-- Reception's own "Log Guest / Urgent Request" flow used to do this
-- dispatch step by hand (an optional checkbox, a regex guess at
-- department) — now redundant, removed in the same app change that ships
-- this migration, so there's exactly one path that creates a task from a
-- request, not two that could double up.
--
-- Also extends department_display_resolve (0046) to report who's
-- currently clocked in (if anyone) — found missing alongside the above:
-- once a badge scan claims a display, nothing on that screen said whose
-- shift it actually was. Apply after 0001-0052.

create or replace function auto_create_task_from_guest_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into tasks (property_id, room_label, title, priority, status, category, guest_request_id)
  values (
    new.property_id,
    coalesce('Room ' || new.room_number, ''),
    new.title,
    case when new.priority = 'High Priority' then 'high' else 'standard' end,
    'pending',
    coalesce(new.department, 'concierge'),
    new.id
  );
  return new;
end;
$$;

drop trigger if exists trg_auto_create_task_from_guest_request on guest_requests;
create trigger trg_auto_create_task_from_guest_request after insert on guest_requests
  for each row execute function auto_create_task_from_guest_request();

create or replace function department_display_resolve(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display department_displays%rowtype;
  v_property_name text;
  v_tasks jsonb;
  v_active_staff_name text;
  v_active_since timestamptz;
begin
  select * into v_display from department_displays where token = p_token and active;
  if not found then
    raise exception 'This display link is invalid or has been revoked.';
  end if;

  update department_displays set last_used_at = now() where id = v_display.id;

  select name into v_property_name from properties where id = v_display.property_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.title, 'description', t.description, 'roomLabel', t.room_label,
    'priority', t.priority, 'status', t.status, 'assignedTo', t.assigned_to,
    'dueLabel', t.due_label, 'rejectionNote', t.rejection_note
  ) order by t.created_at desc), '[]'::jsonb)
  into v_tasks
  from tasks t
  where t.property_id = v_display.property_id
    and t.category = v_display.department
    and t.status in ('pending', 'in_progress');

  select sd.name, ds.claimed_at into v_active_staff_name, v_active_since
  from display_sessions ds
  join staff_directory sd on sd.id = ds.staff_directory_id
  where ds.department_display_id = v_display.id and ds.released_at is null
  order by ds.claimed_at desc
  limit 1;

  return jsonb_build_object(
    'propertyName', coalesce(v_property_name, ''),
    'department', v_display.department,
    'label', v_display.label,
    'tasks', v_tasks,
    'activeStaffName', v_active_staff_name,
    'activeSince', v_active_since
  );
end;
$$;
