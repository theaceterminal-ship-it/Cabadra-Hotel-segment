-- 0090: put back the room-QR lookup that 0089 accidentally replaced.
--
-- 0074 made guest_resolve_room_token find the room by its random QR code
-- (rooms.qr_code). 0089 re-created that function from the older 0072 text to add
-- logging, and in doing so went back to looking the room up by its id, so every
-- printed QR (which carries the random code) resolved to "no guest checked in".
-- This is 0074's lookup with 0089's logging.

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
  v_room_id text;
  v_token uuid;
begin
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
      perform security_log('room_qr_guessing', null, 'rooms', null, jsonb_build_object('last_room_code', left(p_room_id, 64)), 10);
      raise exception 'Too many attempts — wait a few minutes and try again';
    end if;
  end if;

  -- p_room_id keeps its name for the existing client; it carries the QR code.
  select id into v_room_id from rooms where qr_code = lower(trim(coalesce(p_room_id, '')));

  if v_room_id is not null then
    if not check_rate_limit('resolve_room:' || v_room_id, 20, 60) then
      perform security_log('room_qr_rate_limited', (select property_id from rooms where id = v_room_id), 'rooms', v_room_id, '{}'::jsonb, 10);
      raise exception 'Too many attempts for this room — wait a minute and try again';
    end if;

    select r.guest_token into v_token
    from reservations r
    where r.room_id = v_room_id and r.status = 'checked_in'
    order by r.created_at desc
    limit 1;
  end if;

  if v_token is null and v_ip_bucket is not null then
    insert into rate_limit_hits (bucket_key) values (v_ip_bucket);
  end if;

  return v_token;
end;
$$;
