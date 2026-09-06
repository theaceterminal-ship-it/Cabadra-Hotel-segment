-- Per-task QR: the assigned staff member (housekeeping, maintenance,
-- concierge, a driver — none of whom have or need a Cabadra login) scans a
-- code to open a tiny, no-login page for exactly that one task, taps
-- "Start" when they begin and "Done" when they finish. Reception sees the
-- status change on the Live Ops board (already polls every few seconds)
-- and gets a notification the moment it's marked done.
--
-- Same capability-token pattern as reservations.guest_token — a random
-- unguessable uuid embedded in a QR/link IS the authorization, no login,
-- no rate limiting needed (unlike guest_resolve_room_token, which is
-- rate-limited because room ids are short guessable slugs; a uuid is not
-- guessable at any rate). Apply after 0001-0024.

alter table tasks
  add column if not exists task_token uuid not null default gen_random_uuid() unique;

-- Widen the notifications type enum so a completed task can raise one, the
-- same way a new order or a guest request already does (0007_notifications.sql).
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('new_order', 'guest_request', 'high_priority_request', 'task_created', 'new_arrival', 'task_completed'));

-- What the scan page needs to render — task details plus enough property
-- context to show "Grand Horizon Hotel" instead of a bare task card.
-- SECURITY DEFINER + granted to anon: the token itself is the auth, same
-- trust tier as guest_get_context.
create or replace function service_task_resolve(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_property_name text;
begin
  select * into v_task from tasks where task_token = p_token;
  if not found then
    raise exception 'This task link is invalid.';
  end if;

  select name into v_property_name from properties where id = v_task.property_id;

  return jsonb_build_object(
    'id', v_task.id,
    'title', v_task.title,
    'description', v_task.description,
    'roomLabel', v_task.room_label,
    'priority', v_task.priority,
    'category', v_task.category,
    'status', v_task.status,
    'assignedTo', v_task.assigned_to,
    'propertyName', coalesce(v_property_name, '')
  );
end;
$$;

grant execute on function service_task_resolve(uuid) to anon;

-- Only ever moves pending -> in_progress. Already-started or already-done
-- is a silent no-op (returns the current row either way) rather than an
-- error — a double-tap or a re-scan shouldn't show the service person a
-- scary red message.
create or replace function service_task_start(p_token uuid)
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

  if v_task.status = 'pending' then
    update tasks set status = 'in_progress' where id = v_task.id
    returning * into v_task;
  end if;

  return jsonb_build_object('status', v_task.status);
end;
$$;

grant execute on function service_task_start(uuid) to anon;

-- Allowed from either pending or in_progress — if whoever's doing the task
-- forgot to tap Start first (or the task took ten seconds), they shouldn't
-- be blocked from marking it done. Never regresses a completed task.
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
    update tasks set status = 'completed' where id = v_task.id
    returning * into v_task;
  end if;

  return jsonb_build_object('status', v_task.status);
end;
$$;

grant execute on function service_task_complete(uuid) to anon;

-- Reception finds out the moment it's done without needing to be staring
-- at the Live Ops board — same trigger pattern as notify_order_rejected
-- (0017_kitchen_reject_order.sql). Fires only on the pending/in_progress
-- -> completed transition, not on every task update (e.g. reassignment).
create or replace function notify_task_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    insert into notifications (property_id, type, title, body, room_number, ref_id)
    values (
      new.property_id,
      'task_completed',
      'Task done — ' || new.title,
      trim(both ' ' from coalesce(new.room_label, '') ||
        case when new.assigned_to is not null then ' · completed by ' || new.assigned_to else '' end),
      nullif(new.room_label, ''),
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_task_completed on tasks;
create trigger trg_notify_task_completed after update on tasks
  for each row execute function notify_task_completed();
