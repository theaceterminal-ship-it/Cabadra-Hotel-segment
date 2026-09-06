-- Two small additions for the "sign up, no role picker, create your hotel"
-- flow: (1) capture which PMS a hotel already uses, purely as intel for
-- prioritizing the next real connector — it powers no logic yet, same as
-- has_external_pms did on its own before this; (2) let staff_create_property
-- set both PMS fields at the moment of creation, since that's now step 2 of
-- one onboarding form instead of a separate settings toggle visited later.
-- Apply after 0001-0025.

alter table properties
  add column if not exists pms_name text;

comment on column properties.pms_name is
  'Which PMS this property already runs (free text — "eZee", "Cloudbeds", "Not sure", etc.), captured at signup purely as product intel. Powers no behavior; has_external_pms is what actually changes the UI.';

drop function if exists staff_create_property(text, text, text, text, text, text);

create or replace function staff_create_property(
  p_id text, p_name text, p_location text, p_image text default null,
  p_country text default null, p_currency text default 'USD',
  p_has_external_pms boolean default false, p_pms_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;
  insert into properties (id, name, location, status, image, country, currency, has_external_pms, pms_name)
  values (
    p_id, p_name, p_location, 'active', nullif(trim(p_image), ''), nullif(trim(p_country), ''),
    coalesce(nullif(trim(p_currency), ''), 'USD'), coalesce(p_has_external_pms, false), nullif(trim(p_pms_name), '')
  );
  insert into staff_properties (user_id, property_id, role) values (auth.uid(), p_id, 'owner');
end;
$$;

revoke execute on function staff_create_property(text, text, text, text, text, text, boolean, text) from public;
grant execute on function staff_create_property(text, text, text, text, text, text, boolean, text) to authenticated;
