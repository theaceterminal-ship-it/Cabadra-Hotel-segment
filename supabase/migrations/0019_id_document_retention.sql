-- ID document retention: how most PMS/hotel systems actually handle this is
-- a fixed retention window post-checkout (often 30–90 days depending on
-- local law), after which the document is deleted, not just archived. This
-- implements exactly the path discussed: keep the guest profile and stay
-- history, but the ID *photo* itself gets nulled out N days after checkout,
-- automatically, via pg_cron — no one has to remember to run this.
--
-- What this does NOT do: delete the underlying Cloudinary asset. Nulling
-- the URL here removes it from the guest's record and from anything the
-- app displays or returns — the actual file would keep existing in
-- Cloudinary's storage until a separate signed API call deletes it (that
-- needs the Cloudinary API secret, which — like the Supabase service_role
-- key — must never be in client code; it'd be a small Edge Function, same
-- pattern as invite-staff, if you want the asset itself gone too, not just
-- unreferenced).
--
-- Apply after 0001-0018.

alter table guests add column if not exists id_document_purged_at timestamptz;

create or replace function system_purge_expired_id_documents(p_retention_days int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with expired as (
    select g.id
    from guests g
    join reservations r on r.guest_id = g.id
    where g.id_document_url is not null
      and r.status = 'checked_out'
      and r.check_out < now() - make_interval(days => greatest(p_retention_days, 1))
      -- Only once no OTHER reservation for this guest is still active — a
      -- returning guest mid-stay shouldn't have their document erased
      -- because a much older stay aged out.
      and not exists (
        select 1 from reservations r2
        where r2.guest_id = g.id and r2.status in ('upcoming', 'checked_in')
      )
    group by g.id
  )
  update guests set id_document_url = null, id_document_purged_at = now()
  where id in (select id from expired);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- No grant to anon/authenticated at all — this runs only as a scheduled
-- job under the database owner, never called by the app itself.
revoke all on function system_purge_expired_id_documents(int) from public, anon, authenticated;

-- pg_cron is a Supabase-supported extension; this schedules the purge to
-- run once a day. If your project doesn't have pg_cron enabled yet,
-- enabling it here is what does that (Database > Extensions in the
-- dashboard shows the same toggle, this just does it via SQL). 30-day
-- retention is a starting point — change the interval below if your
-- jurisdiction's rule is different.
create extension if not exists pg_cron;

select cron.schedule(
  'purge-expired-id-documents',
  '0 3 * * *', -- daily at 03:00 UTC
  $$select system_purge_expired_id_documents(30)$$
);
