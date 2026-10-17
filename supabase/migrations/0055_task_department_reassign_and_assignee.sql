-- Found live-testing, two gaps once requests started reaching tasks
-- reliably (0053):
--
-- 1. A task's department (category) could never be changed after
--    creation — only "assign to a person within this department"
--    existed (updateTaskAssignment), not "move this to a different
--    department" for a misrouted request. New RPC below updates both
--    tasks.category and, when the task answers a guest_requests row
--    (guest_request_id, 0045), that row's own department too, so the two
--    stay consistent. Clears assigned_to on a department change — whoever
--    was assigned belonged to the OLD department, not necessarily the new
--    one.
--
-- 2. department_display_task_start (0046) never touched assigned_to, so
--    a staff member accepting a task from their phone left Reception's
--    Live Ops board still showing it as unassigned — there was no way to
--    tell who was actually handling it. Now pulls whoever currently has
--    that display claimed (display_sessions, 0047) and assigns the task
--    to them automatically on Start, same name shown in the display's own
--    header (0053).
--
-- Apply after 0001-0054.

create or replace function staff_reassign_task_department(p_task_id uuid, p_department text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
begin
  select * into v_task from tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;
  if not is_staff_for_property(v_task.property_id) then
    raise exception 'Not authorized for this property';
  end if;
  if p_department not in ('housekeeping', 'maintenance', 'amenities', 'concierge') then
    raise exception 'Unknown department: %', p_department;
  end if;

  update tasks set category = p_department, assigned_to = null where id = p_task_id;

  if v_task.guest_request_id is not null then
    update guest_requests set department = p_department where id = v_task.guest_request_id;
  end if;

  return jsonb_build_object('taskId', p_task_id, 'category', p_department);
end;
$$;

revoke execute on function staff_reassign_task_department(uuid, text) from public;
grant execute on function staff_reassign_task_department(uuid, text) to authenticated;

create or replace function department_display_task_start(p_token uuid, p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display department_displays%rowtype;
  v_task tasks%rowtype;
  v_active_staff_name text;
begin
  select * into v_display from department_displays where token = p_token and active;
  if not found then
    raise exception 'This display link is invalid or has been revoked.';
  end if;

  select * into v_task from tasks where id = p_task_id;
  if not found or v_task.property_id <> v_display.property_id or v_task.category <> v_display.department then
    raise exception 'That task is not on this display.';
  end if;

  select sd.name into v_active_staff_name
  from display_sessions ds
  join staff_directory sd on sd.id = ds.staff_directory_id
  where ds.department_display_id = v_display.id and ds.released_at is null
  order by ds.claimed_at desc
  limit 1;

  if v_task.status = 'pending' then
    update tasks
    set status = 'in_progress', assigned_to = coalesce(v_active_staff_name, assigned_to)
    where id = v_task.id
    returning * into v_task;
  end if;

  update department_displays set last_used_at = now() where id = v_display.id;

  return jsonb_build_object('status', v_task.status, 'assignedTo', v_task.assigned_to);
end;
$$;
