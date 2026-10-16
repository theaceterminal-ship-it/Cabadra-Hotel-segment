-- Phase 2 of the Service Management design (system-design doc, "Build
-- Phasing"): link guest_requests to tasks, and give tasks a priced path,
-- instead of letting a priced ask fall through to experience_bookings and
-- drop off the Live Ops board entirely. Schema + functions only — the
-- queue UI (reject button, price display, department displays) is a
-- separate follow-up. Apply after 0001-0044.

-- Most tasks are unpriced and need no billing target at all, so both of
-- these stay nullable.
alter table tasks add column if not exists guest_request_id uuid references guest_requests(id) on delete set null;

-- Kept directly on tasks rather than relying on
-- guest_request_id -> guest_requests.reservation_id, which can itself be
-- null (a walk-up/phone-in request has no guest link, same comment as
-- guest_requests.reservation_id in 0003_ops_and_owner.sql) — too fragile a
-- chain for money-handling code to walk through.
alter table tasks add column if not exists reservation_id uuid references reservations(id) on delete set null;
alter table tasks add column if not exists price numeric(10, 2);
alter table tasks add column if not exists rejection_note text;

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('pending', 'in_progress', 'completed', 'rejected'));

create index if not exists idx_tasks_reservation on tasks(reservation_id);
create index if not exists idx_tasks_guest_request on tasks(guest_request_id);

-- Mirrors folio_charges.order_id's existing shape (0001_init.sql) — a
-- nullable reference back to whichever source created the charge, not a
-- reverse pointer on the source table (tasks does not get a
-- folio_charge_id column; "which charge did this task post" is answered
-- by querying folio_charges where task_id = ..., same as for orders).
alter table folio_charges add column if not exists task_id uuid references tasks(id) on delete set null;

create index if not exists idx_folio_charges_task on folio_charges(task_id);

-- Completing a priced task posts its folio charge in the same transaction
-- — the same guarantee guest_place_order already gives food orders, a
-- priced task can never be marked done without its charge landing, or vice
-- versa. An unpriced task just flips status, same as a plain client update
-- would have done; tasks already carries a staff "for all" RLS policy, so
-- this function exists only for the one case a plain update can't make
-- atomic. A second call against an already-completed task is a no-op
-- rather than an error, same tolerance service_task_start (0025) gives a
-- double-tap or re-scan.
create or replace function staff_complete_task(p_task_id uuid)
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
  if not is_staff_for_property(v_task.property_id) then
    raise exception 'Not authorized for this property';
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

  -- A linked request is done the moment its task is — one write closes
  -- both, instead of reception remembering to resolve the request too.
  if v_task.guest_request_id is not null then
    update guest_requests set status = 'resolved', resolved_at = now()
      where id = v_task.guest_request_id and status = 'open';
  end if;

  return jsonb_build_object('taskId', v_task.id, 'status', 'completed', 'charged', v_charge.id is not null);
end;
$$;

revoke execute on function staff_complete_task(uuid) from public;
grant execute on function staff_complete_task(uuid) to authenticated;

-- Reject-with-reason, mirroring staff_reject_order (0017_kitchen_reject_order.sql)
-- exactly: only rejectable before work starts, a note is required. Unlike
-- the order side, nothing to void here — a task's charge is only posted at
-- completion (above), never at creation, so a task rejected while still
-- 'pending' never had a folio_charges row to begin with.
create or replace function staff_reject_task(p_task_id uuid, p_note text)
returns void
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
  if v_task.status <> 'pending' then
    raise exception 'Only a pending (not yet started) task can be rejected';
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'A reason is required so the guest knows why';
  end if;

  update tasks set status = 'rejected', rejection_note = trim(p_note) where id = p_task_id;
end;
$$;

revoke execute on function staff_reject_task(uuid, text) from public;
grant execute on function staff_reject_task(uuid, text) to authenticated;

-- Staff-side heads-up, same pattern as notify_order_rejected (0017).
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('new_order', 'guest_request', 'high_priority_request', 'task_created', 'new_arrival', 'task_completed', 'task_rejected'));

create or replace function notify_task_rejected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    insert into notifications (property_id, type, title, body, room_number, ref_id)
    values (
      new.property_id, 'task_rejected', 'Task rejected — ' || coalesce(nullif(new.room_label, ''), new.title),
      coalesce(new.rejection_note, ''), nullif(new.room_label, ''), new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_task_rejected on tasks;
create trigger trg_notify_task_rejected after update on tasks
  for each row execute function notify_task_rejected();
