-- Property photo upload already worked for an *existing* property
-- (ImageUploadField + properties.image, since 0005) — the gap was
-- creation-time: staff_create_property() had no image parameter, so a
-- fresh property always started blank and needed a second trip to the
-- Overview tab just to add a photo. Adds an optional image argument;
-- CREATE OR REPLACE with a default keeps every existing call site working
-- unchanged. Apply after 0001-0009.

-- A 4-arg overload alongside the old 3-arg one would make every existing
-- 3-arg call site ambiguous ("function is not unique") the moment the
-- 4th parameter has a default — so the old signature is dropped, not just
-- shadowed, and every caller (createProperty in staffApi.ts) is updated in
-- the same change to always pass all four.
drop function if exists staff_create_property(text, text, text);

create or replace function staff_create_property(p_id text, p_name text, p_location text, p_image text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;
  insert into properties (id, name, location, status, image) values (p_id, p_name, p_location, 'active', nullif(trim(p_image), ''));
  insert into staff_properties (user_id, property_id, role) values (auth.uid(), p_id, 'owner');
end;
$$;

revoke execute on function staff_create_property(text, text, text, text) from public;
grant execute on function staff_create_property(text, text, text, text) to authenticated;
