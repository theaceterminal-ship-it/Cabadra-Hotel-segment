-- Removes everything created to visually verify the new theme (light +
-- dark) across Owner and Reception: the test property (cascades its
-- rooms/staff_properties) and both test accounts. Nothing else touched.
delete from properties where id = 'theme-verify-hotel';

delete from auth.users where email in (
  'theme-verify@mailinator.com',
  'theme-verify-reception@mailinator.com'
);
