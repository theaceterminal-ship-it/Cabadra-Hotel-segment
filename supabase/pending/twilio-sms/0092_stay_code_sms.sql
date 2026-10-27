-- 0092 (PENDING, not applied): phone-number (SMS) stay codes. See README.md in this folder.
-- Move into supabase/migrations/ and apply when the Twilio sender is being switched on.
-- Apply after 0091.

create or replace function system_issue_stay_code(p_reservation_id uuid, p_channel text default 'email')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_res reservations%rowtype;
  v_guest guests%rowtype;
  v_room rooms%rowtype;
  v_prop properties%rowtype;
  v_code text := lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
  v_salt text := encode(gen_random_bytes(8), 'hex');
  v_masked text;
  v_to text;
begin
  select * into v_res from reservations where id = p_reservation_id;
  if not found or v_res.status <> 'checked_in' then
    return jsonb_build_object('ok', false, 'reason', 'not_checked_in');
  end if;
  select * into v_guest from guests where id = v_res.guest_id;
  select * into v_room from rooms where id = v_res.room_id;
  select * into v_prop from properties where id = v_res.property_id;
  if p_channel = 'email' then
    if coalesce(trim(v_guest.email), '') = '' then
      return jsonb_build_object('ok', false, 'reason', 'no_email');
    end if;
    v_masked := mask_email(trim(v_guest.email));
    v_to := trim(v_guest.email);
  elsif p_channel = 'sms' then
    v_to := regexp_replace(coalesce(v_guest.phone, ''), '[^0-9+]', '', 'g');
    if v_to !~ '^\+[1-9][0-9]{6,14}$' then
      return jsonb_build_object('ok', false, 'reason', 'no_phone');
    end if;
    v_masked := left(v_to, 3) || repeat('•', greatest(length(v_to) - 5, 3)) || right(v_to, 2);
  else
    return jsonb_build_object('ok', false, 'reason', 'channel_not_enabled');
  end if;

  insert into stay_access_codes (reservation_id, channel, sent_to_masked, code_hash, salt, issued_at, failed_attempts, lock_cycles, locked_until, send_error)
  values (p_reservation_id, p_channel, v_masked, encode(digest(v_salt || v_code || p_reservation_id::text, 'sha256'), 'hex'), v_salt, now(), 0, 0, null, null)
  on conflict (reservation_id) do update
    set channel = excluded.channel, sent_to_masked = excluded.sent_to_masked, code_hash = excluded.code_hash, salt = excluded.salt,
        issued_at = now(), failed_attempts = 0, lock_cycles = 0, locked_until = null, send_error = null;
  update reservations set access_mode = p_channel where id = p_reservation_id and access_mode <> p_channel;

  return jsonb_build_object(
    'ok', true, 'channel', p_channel, 'code', v_code, 'to', v_to, 'guest_name', v_guest.name,
    'property_name', v_prop.name, 'room_number', v_room.number, 'check_out', v_res.check_out
  );
end;
$$;
revoke all on function system_issue_stay_code(uuid, text) from public, anon, authenticated;
grant execute on function system_issue_stay_code(uuid, text) to service_role;
