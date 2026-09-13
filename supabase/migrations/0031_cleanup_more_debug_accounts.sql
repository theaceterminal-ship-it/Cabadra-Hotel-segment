-- Removes every possible leftover from the abandoned cross-tenant test
-- fixture (0030, superseded) plus the Resend SMTP verification signup —
-- written defensively since 0030 partially applied before being
-- abandoned and it's not fully certain which of these exist. Deleting
-- the properties first cascades their staff_properties/staff_directory/
-- tasks rows; deleting the auth.users rows is safe whether or not they
-- exist. Scoped to these exact debug-only identifiers only.

delete from properties where id in ('tenant-a-hotel', 'tenant-b-hotel');

delete from auth.users where email in (
  'tenant-a-owner@mailinator.com',
  'tenant-b-owner@mailinator.com',
  'resend-smtp-test@mailinator.com'
);
