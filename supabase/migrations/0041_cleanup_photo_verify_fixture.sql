-- Removes everything created to investigate the "property photo not
-- saving" report and verify the new no-photo gradient fallback: the test
-- property (cascades rooms/reservations/staff_properties) and the one
-- test account.
delete from properties where id = 'photo-verify-hotel';

delete from auth.users where email = 'photo-verify@mailinator.com';
