-- Confirms one throwaway account to reproduce the "property photo not
-- being saved" report. Removed by a follow-up cleanup migration.
update auth.users set email_confirmed_at = now()
where email = 'photo-verify@mailinator.com' and email_confirmed_at is null;
