-- Migration 0057: SECURITY DEFINER RPC for updating property details (name, location, image, status, upi_id, has_external_pms)
-- Guarantees that updating property image works reliably without being blocked by client-side RLS quirks.

create or replace function staff_update_property(
  p_property_id text,
  p_name text default null,
  p_location text default null,
  p_image text default null,
  p_status text default null,
  p_upi_id text default null,
  p_has_external_pms boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff_for_property(p_property_id) then
    raise exception 'Not authorized for this property';
  end if;

  update properties
  set
    name = coalesce(p_name, name),
    location = coalesce(p_location, location),
    image = case when p_image is not null then p_image else image end,
    status = coalesce(p_status, status),
    upi_id = case when p_upi_id is not null then p_upi_id else upi_id end,
    has_external_pms = coalesce(p_has_external_pms, has_external_pms)
  where id = p_property_id;

  if not found then
    raise exception 'Property % not found', p_property_id;
  end if;
end;
$$;

revoke execute on function staff_update_property(text, text, text, text, text, text, boolean) from public;
grant execute on function staff_update_property(text, text, text, text, text, text, boolean) to authenticated;
