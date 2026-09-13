-- Cleans up everything created while reproducing the provision-access-link
-- report: the throwaway "Debug Test Hotel" property (cascades to its
-- rooms/staff_properties/property_access_links via FK) and the two test
-- auth accounts (the owner account signup created, and the dedicated
-- shared reception account provision-access-link created for it). Both
-- deletes are scoped to exact, unique debug-only identifiers — nothing
-- else is touched.

delete from properties where id = 'debug-test-hotel';

delete from auth.users where email in (
  'debugtest.accesslinks@mailinator.com',
  'access-receptionist-debug-test-hotel@access.cabadra.internal'
);
