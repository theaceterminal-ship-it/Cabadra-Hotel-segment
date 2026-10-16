-- The gap flagged in the system-design doc's "Which Departments, and Which
-- Priority" section: department_display_resolve/_task_start/_task_complete
-- shipped in 0046, but a display couldn't reject a task — only staff on
-- the Reception board could. Closes that, mirroring staff_reject_task
-- (0045) and department_display_task_start/_complete (0046) exactly: only
-- while still pending, a note is required, and the task must actually
-- belong to this display's property + department. Apply after 0001-0047.

create or replace function department_display_task_reject(p_token uuid, p_task_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display department_displays%rowtype;
  v_task tasks%rowtype;
begin
  select * into v_display from department_displays where token = p_token and active;
  if not found then
    raise exception 'This display link is invalid or has been revoked.';
  end if;

  select * into v_task from tasks where id = p_task_id;
  if not found or v_task.property_id <> v_display.property_id or v_task.category <> v_display.department then
    raise exception 'That task is not on this display.';
  end if;

  if v_task.status <> 'pending' then
    raise exception 'Only a pending (not yet started) task can be rejected';
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'A reason is required so the guest knows why';
  end if;

  update tasks set status = 'rejected', rejection_note = trim(p_note) where id = p_task_id;
  update department_displays set last_used_at = now() where id = v_display.id;

  return jsonb_build_object('status', 'rejected');
end;
$$;

grant execute on function department_display_task_reject(uuid, uuid, text) to anon;
