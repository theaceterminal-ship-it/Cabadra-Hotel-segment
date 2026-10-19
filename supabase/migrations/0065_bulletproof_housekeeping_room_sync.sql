-- Migration 0065: Bulletproof Housekeeping Room Status Automation
-- Automatically updates rooms.status from 'dirty' -> 'cleaning' -> 'ready'
-- whenever a housekeeping cleaning task is started ('in_progress') or finished ('completed').

create or replace function trg_sync_housekeeping_room_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_num text;
  v_found_room_id text;
begin
  -- 1. Extract raw room number or room ID
  v_room_num := coalesce(
    nullif(trim(NEW.room_number), ''),
    nullif(regexp_replace(NEW.room_label, '[^0-9]', '', 'g'), ''),
    nullif(regexp_replace(NEW.title, '[^0-9]', '', 'g'), '')
  );

  -- 2. Locate matching room in property
  if v_room_num is not null and length(v_room_num) > 0 then
    select id into v_found_room_id
    from rooms
    where property_id = NEW.property_id
      and (
        id = NEW.room_number
        or number = v_room_num
        or id = NEW.property_id || '-' || v_room_num
      )
    limit 1;
  end if;

  -- 3. Update room status if task belongs to Housekeeping/Cleaning
  if v_found_room_id is not null then
    if NEW.category = 'housekeeping' or lower(NEW.title) like '%clean%' then

      -- State 1: Task becomes 'in_progress' -> Room status moves to 'cleaning'
      if NEW.status = 'in_progress' and (OLD.status is null or OLD.status <> 'in_progress') then
        update rooms
        set status = 'cleaning'
        where id = v_found_room_id;

      -- State 2: Task becomes 'completed' -> Room status moves to 'ready'
      elsif NEW.status = 'completed' and (OLD.status is null or OLD.status <> 'completed') then
        update rooms
        set status = 'ready', clean_progress = 100
        where id = v_found_room_id;

      end if;

    end if;
  end if;

  return NEW;
end;
$$;

-- Drop and recreate trigger on tasks table
drop trigger if exists trg_housekeeping_room_status_sync on tasks;
create trigger trg_housekeeping_room_status_sync
  after insert or update on tasks
  for each row
  execute function trg_sync_housekeeping_room_status();

-- Ensure staff_complete_task updates the room status explicitly as a backup
create or replace function staff_complete_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_charge folio_charges%rowtype;
  v_room_num text;
  v_found_room_id text;
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

  -- A linked request is done the moment its task is
  if v_task.guest_request_id is not null then
    update guest_requests set status = 'resolved', resolved_at = now()
      where id = v_task.guest_request_id and status = 'open';
  end if;

  -- Explicit Housekeeping Room Status Update Backup
  v_room_num := coalesce(
    nullif(trim(v_task.room_number), ''),
    nullif(regexp_replace(v_task.room_label, '[^0-9]', '', 'g'), ''),
    nullif(regexp_replace(v_task.title, '[^0-9]', '', 'g'), '')
  );

  if v_room_num is not null and length(v_room_num) > 0 then
    if v_task.category = 'housekeeping' or lower(v_task.title) like '%clean%' then
      update rooms
      set status = 'ready', clean_progress = 100
      where property_id = v_task.property_id
        and (id = v_task.room_number or number = v_room_num);
    end if;
  end if;

  return jsonb_build_object('taskId', v_task.id, 'status', 'completed', 'charged', v_charge.id is not null);
end;
$$;

revoke execute on function staff_complete_task(uuid) from public;
grant execute on function staff_complete_task(uuid) to authenticated, anon;
