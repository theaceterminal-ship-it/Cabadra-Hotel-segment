-- Department Displays (system-design doc, "Department Displays" under
-- Service Management): a capability-token link per physical device — a
-- kitchen tablet, a housekeeping phone, a front-desk screen — scoped to
-- one department's live queue, no login, same trust tier as
-- reservations.guest_token / tasks.task_token. Several devices per
-- department is normal, and each is independently revocable: losing one
-- tablet should kill that one link, not the whole department's access.
--
-- Found while writing this: service_task_complete (0025_task_qr.sql) moves
-- a task straight to 'completed' with a bare update, bypassing the
-- pricing/billing staff_complete_task (0045) added — a priced task
-- finished through the no-login per-task QR never posted its folio
-- charge. Fixed below by extracting the shared core both now call, instead
-- of adding a THIRD copy of that logic for this migration's own
-- department_display_task_complete. Schema + functions only — the
-- /display/:token page and the admin screen to generate/revoke/QR these
-- links are a separate follow-up. Apply after 0001-0045.

-- ============================================================================
-- SHARED COMPLETION LOGIC — not granted to anon or authenticated directly;
-- callers validate their own authorization, then delegate here so the
-- pricing/folio/request-resolution logic lives in exactly one place.
-- ============================================================================

create or replace function task_complete_core(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_charge folio_charges%rowtype;
begin
  select * into v_task from tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;
  if v_task.status = 'completed' then
    return jsonb_build_object('taskId', v_task.id, 'status', 'completed', 'charged', false);
  end if;

  if v_task.price is not null and v_task.price > 0 then
    if v_task.reservation_id is null then
      raise exception 'Priced task has no reservation to bill — set tasks.reservation_id first';
    end if;

    insert into folio_charges (property_id, reservation_id, task_id, description, amount, category)
    values (
      v_task.property_id, v_task.reservation_id, v_task.id,
      coalesce(nullif(trim(v_task.title), ''), 'Service charge'), v_task.price, 'other'
    )
    returning * into v_charge;
  end if;

  update tasks set status = 'completed' where id = p_task_id returning * into v_task;

  if v_task.guest_request_id is not null then
    update guest_requests set status = 'resolved', resolved_at = now()
      where id = v_task.guest_request_id and status = 'open';
  end if;

  return jsonb_build_object('taskId', v_task.id, 'status', 'completed', 'charged', v_charge.id is not null);
end;
$$;

-- staff_complete_task now just authorizes, then delegates.
create or replace function staff_complete_task(p_task_id uuid)
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

  return task_complete_core(p_task_id);
end;
$$;

revoke execute on function staff_complete_task(uuid) from public;
grant execute on function staff_complete_task(uuid) to authenticated;

-- The bug fix: service_task_complete now goes through the same core logic
-- instead of its own bare update, so a priced task finished via the
-- no-login per-task QR posts its folio charge too.
create or replace function service_task_complete(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
begin
  select * into v_task from tasks where task_token = p_token;
  if not found then
    raise exception 'This task link is invalid.';
  end if;

  if v_task.status <> 'completed' then
    perform task_complete_core(v_task.id);
    select * into v_task from tasks where id = v_task.id;
  end if;

  return jsonb_build_object('status', v_task.status);
end;
$$;

grant execute on function service_task_complete(uuid) to anon;

-- ============================================================================
-- DEPARTMENT DISPLAYS
-- ============================================================================

create table department_displays (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references properties(id) on delete cascade,
  department text not null check (department in ('housekeeping', 'maintenance', 'amenities', 'concierge')),
  label text not null,
  token uuid not null default gen_random_uuid() unique,
  active boolean not null default true,
  last_used_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table department_displays enable row level security;

-- Plain RLS, no RPC needed for staff-side CRUD — same shape as tasks and
-- guest_requests: creating, labeling and revoking a display is an
-- ordinary property-scoped write, not something that needs its own
-- function.
create policy "staff can manage department displays on their property" on department_displays
  for all using (is_staff_for_property(property_id)) with check (is_staff_for_property(property_id));

create index idx_department_displays_property on department_displays(property_id);

revoke all on department_displays from anon;

-- What the display page loads on open — a point-in-time snapshot of its
-- department's open queue, not a subscription (the page itself re-polls or
-- re-resolves, same as the Live Ops board already does). last_used_at
-- updates on every resolve, so a stale/never-opened display is visible to
-- staff deciding what to revoke.
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

  return jsonb_build_object(
    'propertyName', coalesce(v_property_name, ''),
    'department', v_display.department,
    'label', v_display.label,
    'tasks', v_tasks
  );
end;
$$;

grant execute on function department_display_resolve(uuid) to anon;

-- Validates the device token is active AND the task actually belongs to
-- that property + department, so a display can't be pointed at another
-- department's (or another property's) task by a crafted request. Same
-- double-tap tolerance as service_task_start: already in_progress is a
-- silent no-op, not an error.
create or replace function department_display_task_start(p_token uuid, p_task_id uuid)
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

  if v_task.status = 'pending' then
    update tasks set status = 'in_progress' where id = v_task.id returning * into v_task;
  end if;

  update department_displays set last_used_at = now() where id = v_display.id;

  return jsonb_build_object('status', v_task.status);
end;
$$;

grant execute on function department_display_task_start(uuid, uuid) to anon;

create or replace function department_display_task_complete(p_token uuid, p_task_id uuid)
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

  perform task_complete_core(v_task.id);
  update department_displays set last_used_at = now() where id = v_display.id;

  select * into v_task from tasks where id = v_task.id;
  return jsonb_build_object('status', v_task.status);
end;
$$;

grant execute on function department_display_task_complete(uuid, uuid) to anon;
