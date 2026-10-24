-- ID photos: delete the file itself, not just the link to it.
--
-- 0019 already nulls guests.id_document_url 30 days after checkout, daily
-- via pg_cron, but the image stayed on Cloudinary (uploaded unsigned, so
-- reachable forever by anyone holding the URL). The privacy policy
-- promises deletion, so this adds the missing half:
--
--   1. Any time an ID photo URL is cleared or replaced (the daily purge, a
--      re-upload at a later check-in, a guest row deleted), a trigger puts
--      the old URL on id_document_deletions.
--   2. A second daily pg_cron job calls the purge-id-document-files Edge
--      Function (via pg_net), which deletes each queued file from
--      Cloudinary with the Admin API and marks it done.
--
-- It also widens the 30-day rule: the photo goes once every reservation
-- for that guest ended more than 30 days ago, whatever its status. Under
-- 0019 a stay nobody marked "checked out" (or a no-show) kept its ID photo
-- forever.
--
-- Needs, outside this file (see README "ID photo deletion"):
--   - Vault secrets `project_url` and `id_document_purge_cron_secret`
--   - Edge Function secrets CRON_SECRET (same value), CLOUDINARY_CLOUD_NAME,
--     CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, and the function deployed with --no-verify-jwt.
-- Until the Cloudinary keys exist the queue simply waits; nothing is lost.
-- Apply after 0001-0067.

create table if not exists id_document_deletions (
  id bigint generated always as identity primary key,
  url text not null,
  guest_id uuid,
  queued_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- 'deleted', 'not_found' (already gone) or 'skipped_not_cloudinary' (a pasted link to somewhere else).
  result text,
  attempts integer not null default 0,
  last_error text
);

comment on table id_document_deletions is
  'ID photo files waiting to be deleted from Cloudinary. Filled by trigger; emptied by the purge-id-document-files Edge Function. No client access.';

create index if not exists id_document_deletions_pending_idx
  on id_document_deletions (queued_at) where deleted_at is null;

-- RLS on with no policies: only the service_role (the Edge Function) and
-- the database owner (the trigger, pg_cron) ever touch it.
alter table id_document_deletions enable row level security;

create or replace function queue_id_document_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.id_document_url is not null then
      insert into id_document_deletions (url, guest_id) values (old.id_document_url, old.id);
    end if;
    return old;
  end if;

  if old.id_document_url is not null and old.id_document_url is distinct from new.id_document_url then
    insert into id_document_deletions (url, guest_id) values (old.id_document_url, old.id);
  end if;
  return new;
end;
$$;

drop trigger if exists guests_queue_id_document_deletion on guests;
create trigger guests_queue_id_document_deletion
  after update of id_document_url or delete on guests
  for each row execute function queue_id_document_deletion();

-- Same signature as 0019, so the existing 03:00 cron job keeps calling it.
create or replace function system_purge_expired_id_documents(p_retention_days int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update guests g
  set id_document_url = null,
      id_document_purged_at = now()
  where g.id_document_url is not null
    -- Every stay for this guest, in any status, ended more than the
    -- retention window ago. A returning guest with a current or recent
    -- stay keeps their document.
    and not exists (
      select 1 from reservations r
      where r.guest_id = g.id
        and r.check_out >= now() - make_interval(days => greatest(p_retention_days, 1))
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function system_purge_expired_id_documents(int) from public, anon, authenticated;

-- pg_net lets pg_cron call the Edge Function over HTTP.
create extension if not exists pg_net;

-- Reads the function URL and shared secret from Vault at run time, so
-- neither is stored in this file or in cron.job.
select cron.unschedule('delete-id-document-files')
where exists (select 1 from cron.job where jobname = 'delete-id-document-files');

select cron.schedule(
  'delete-id-document-files',
  '30 3 * * *', -- daily at 03:30 UTC, after the 03:00 purge has queued the day's files
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/purge-id-document-files',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'id_document_purge_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  $$
);
