-- Found live-testing: a guest submits a housekeeping/concierge/etc request
-- (guest_submit_request, 0003/0018) and it genuinely lands in
-- guest_requests — but nothing on the guest's own screen ever says so.
-- There's a real-time "Order received, kitchen will start shortly" bar for
-- food (OrderStatusBar/guest_get_active_order); requests had no equivalent,
-- so a guest who asked for towels has no way to know it arrived short of
-- asking someone. This is that function — the guest-facing read side of
-- the link tasks.guest_request_id already gives (0045): a request's
-- displayed status is its linked task's (pending/in_progress/completed/
-- rejected) when one exists, "received" when staff hasn't turned it into a
-- task yet. Apply after 0001-0050.

create or replace function guest_get_active_requests(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_result jsonb;
begin
  select * into v_reservation from reservations where guest_token = p_token;
  if not found then
    raise exception 'Invalid guest link';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gr.id,
    'title', gr.title,
    'department', gr.department,
    'priority', gr.priority,
    'createdAt', gr.created_at,
    'taskStatus', t.status,
    'rejectionNote', t.rejection_note
  ) order by gr.created_at desc), '[]'::jsonb)
  into v_result
  from guest_requests gr
  left join tasks t on t.guest_request_id = gr.id
  where gr.reservation_id = v_reservation.id and gr.status = 'open';

  return v_result;
end;
$$;

grant execute on function guest_get_active_requests(uuid) to anon;
