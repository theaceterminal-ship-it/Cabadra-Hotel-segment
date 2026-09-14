-- Confirms one throwaway account to verify the removed "+ Custom
-- Concierge Request" link on the guest app. Removed by a follow-up
-- cleanup migration.
update auth.users set email_confirmed_at = now()
where email = 'concierge-link-verify@mailinator.com' and email_confirmed_at is null;
