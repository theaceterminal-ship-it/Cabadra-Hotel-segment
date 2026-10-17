-- Migration 0060: Backfill & resolve any open guest_requests linked to completed or rejected tasks.
-- Ensures legacy requests created before migration 0059 clean up properly across Reception Dashboard & Guest App.

update guest_requests gr
set status = 'resolved', resolved_at = now()
from tasks t
where t.guest_request_id = gr.id
  and gr.status = 'open'
  and t.status in ('completed', 'rejected');
