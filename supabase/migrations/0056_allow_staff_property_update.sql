-- Migration 0056: Expand property UPDATE policy to all assigned staff (owners & receptionists)
-- Fixes property image and settings updates being silently rejected under RLS when role != 'owner'.

drop policy if exists "owners can update their properties" on properties;
drop policy if exists "staff can update their properties" on properties;

create policy "staff can update their properties" on properties
  for update using (is_staff_for_property(id)) with check (is_staff_for_property(id));
