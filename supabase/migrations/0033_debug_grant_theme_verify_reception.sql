-- Confirms + grants receptionist access on the theme-verify-hotel test
-- property so the new ReceptionDashboard (room grid, search, stats) can
-- be visually checked in both themes. Removed along with the rest of the
-- theme-verify fixture by a follow-up cleanup migration.
update auth.users set email_confirmed_at = now()
where email = 'theme-verify-reception@mailinator.com' and email_confirmed_at is null;

insert into staff_properties (user_id, property_id, role)
select (select id from auth.users where email = 'theme-verify-reception@mailinator.com'), 'theme-verify-hotel', 'receptionist'
where not exists (
  select 1 from staff_properties
  where user_id = (select id from auth.users where email = 'theme-verify-reception@mailinator.com') and property_id = 'theme-verify-hotel'
);
