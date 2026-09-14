-- Confirms one throwaway account to verify the itemized room-service
-- folio charge fix (0035) live. Removed by a follow-up cleanup migration.
update auth.users set email_confirmed_at = now()
where email = 'folio-verify@mailinator.com' and email_confirmed_at is null;
