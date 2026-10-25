-- Room QR lookups: make failed attempts count toward the rate limit.
--
-- guest_resolve_room_token (0011, rate-limited in 0020) raised an
-- exception when a room had no checked-in guest. The exception rolled back
-- the whole call, including the hit check_rate_limit had just recorded, so
-- only successful lookups were ever counted. Room ids are guessable
-- ('<property-slug>-<room number>'), so probing room after room went
-- completely unthrottled.
--
-- Now:
--   - "No guest here" (or no such room) returns NULL instead of raising,
--     so the call commits and its hits stay recorded. The client treats
--     NULL as "no one's checked in" (resolveRoomToken in lib/guestApi.ts).
--   - Besides the per-room limit (20 a minute, real rooms only), each
--     caller gets at most 20 failed lookups per 10 minutes, keyed on their
--     IP (Cloudflare's cf-connecting-ip, else the first x-forwarded-for
--     entry PostgREST passes through). That caps trying many different
--     room ids, which the per-room limit never could. A guest scanning
--     their own room successfully is never counted against this.
--   - Made-up room ids don't get a bucket of their own (only the caller's
--     failure count goes up), and a daily pg_cron job clears hits older
--     than a day, so junk ids can't grow the table.
--
-- Rate limiting slows guessing down; it can't make a guessable id secret.
-- The full fix is a random per-room QR code (needs reprinted stickers).
-- Apply after 0001-0071.

create index if not exists idx_rate_limit_hits_hit_at on rate_limit_hits (hit_at);

create or replace function guest_resolve_room_token(p_room_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers json;
  v_ip text;
  v_ip_bucket text;
  v_room_exists boolean;
  v_token uuid;
begin
  -- Who is calling. NULL outside a PostgREST request (e.g. SQL editor),
  -- in which case only the per-room limit applies.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := coalesce(
    nullif(trim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '')
  );
  v_ip_bucket := case when v_ip is not null then 'resolve_room_failures:' || v_ip end;

  if v_ip_bucket is not null then
    delete from rate_limit_hits where bucket_key = v_ip_bucket and hit_at < now() - interval '10 minutes';
    if (select count(*) from rate_limit_hits where bucket_key = v_ip_bucket) >= 20 then
      raise exception 'Too many attempts — wait a few minutes and try again';
    end if;
  end if;

  select exists (select 1 from rooms where id = p_room_id) into v_room_exists;

  if v_room_exists then
    if not check_rate_limit('resolve_room:' || p_room_id, 20, 60) then
      raise exception 'Too many attempts for this room — wait a minute and try again';
    end if;

    select r.guest_token into v_token
    from reservations r
    where r.room_id = p_room_id and r.status = 'checked_in'
    order by r.created_at desc
    limit 1;
  end if;

  if v_token is null and v_ip_bucket is not null then
    insert into rate_limit_hits (bucket_key) values (v_ip_bucket);
  end if;

  -- NULL = no such room, or no one checked in. Not an exception, so the
  -- hits recorded above are kept.
  return v_token;
end;
$$;

revoke all on function guest_resolve_room_token(text) from public;
grant execute on function guest_resolve_room_token(text) to anon, authenticated;

select cron.unschedule('sweep-rate-limit-hits')
where exists (select 1 from cron.job where jobname = 'sweep-rate-limit-hits');

select cron.schedule(
  'sweep-rate-limit-hits',
  '15 3 * * *', -- daily, 03:15 UTC
  $$delete from rate_limit_hits where hit_at < now() - interval '1 day'$$
);
