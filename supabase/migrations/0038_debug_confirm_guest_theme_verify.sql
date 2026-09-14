-- Confirms one throwaway account to visually verify the guest app's new
-- theme (light only, no dark toggle). Removed by a follow-up cleanup
-- migration.
update auth.users set email_confirmed_at = now()
where email = 'guest-theme-verify@mailinator.com' and email_confirmed_at is null;
