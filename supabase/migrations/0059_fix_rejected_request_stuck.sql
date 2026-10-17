-- Migration 0059: Fix rejected guest requests getting stuck in active requests.
-- 1. Ensure department_display_task_reject resolves linked guest_requests.
-- 2. Provide guest_dismiss_request(p_token, p_request_id) so a guest can dismiss a request.
-- 3. Grant execute on guest_get_active_requests to both authenticated and anon.

grant execute on function guest_get_active_requests(uuid) to authenticated, anon;

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

  if v_task.guest_request_id is not null then
    update guest_requests set status = 'resolved', resolved_at = now() where id = v_task.guest_request_id;
  end if;

  update department_displays set last_used_at = now() where id = v_display.id;

  return jsonb_build_object('status', 'rejected');
end;
$$;

grant execute on function department_display_task_reject(uuid, uuid, text) to authenticated, anon;

create or replace function guest_dismiss_request(p_token uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  update guest_requests
  set status = 'resolved', resolved_at = now()
  where id = p_request_id and reservation_id = v_reservation.id;
end;
$$;

revoke execute on function guest_dismiss_request(uuid, uuid) from public;
grant execute on function guest_dismiss_request(uuid, uuid) to authenticated, anon;
