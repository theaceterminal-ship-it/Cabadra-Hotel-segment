-- Removes everything created to verify the itemized room-service folio
-- charge fix (0035): the test property (cascades rooms/reservations/
-- orders/folio_charges/staff_properties) and the one test account.
delete from properties where id = 'folio-verify-hotel';

delete from auth.users where email = 'folio-verify@mailinator.com';
