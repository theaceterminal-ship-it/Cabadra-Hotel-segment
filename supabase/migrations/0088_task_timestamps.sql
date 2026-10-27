-- 0088: when each task was started and finished.
--
-- tasks.created_at (the request time) already existed but the Live Ops screen
-- never read it, so every task looked like "today" and had no time. Now the
-- start and finish times are recorded too, by a trigger on status changes so
-- every path (reception board, department screen, task QR, guest-request
-- resolve) is covered without touching each function.

alter table tasks
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

create or replace function tasks_stamp_times()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'in_progress' and new.started_at is null then
      new.started_at := now();
    elsif new.status in ('completed', 'rejected') then
      new.completed_at := now();
      if new.started_at is null and new.status = 'completed' then new.started_at := old.created_at; end if;
    elsif new.status = 'pending' then
      new.started_at := null;
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_stamp_times on tasks;
create trigger tasks_stamp_times before update on tasks
  for each row execute function tasks_stamp_times();

-- Tasks that were already finished: the best we know is when they were created.
update tasks set completed_at = created_at where status in ('completed', 'rejected') and completed_at is null;

-- Day-by-day filtering on the Live Ops screen reads by property and date.
create index if not exists tasks_property_created_idx on tasks (property_id, created_at desc);
