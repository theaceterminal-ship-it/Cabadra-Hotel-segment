-- Removes everything created to verify the removed "+ Custom Concierge
-- Request" link: the test property (cascades rooms/reservations/
-- staff_properties) and the one test account.
delete from properties where id = 'concierge-link-verify-hotel';

delete from auth.users where email = 'concierge-link-verify@mailinator.com';
