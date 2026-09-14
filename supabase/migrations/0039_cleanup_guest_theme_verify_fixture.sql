-- Removes everything created to visually verify the guest app's new
-- theme: the test property (cascades rooms/reservations/staff_properties)
-- and the one test account.
delete from properties where id = 'guest-theme-verify-hotel';

delete from auth.users where email = 'guest-theme-verify@mailinator.com';
