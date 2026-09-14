-- Confirms one throwaway test account created to visually verify the new
-- lavender/plum/lime theme + dark mode across Owner and Reception. Removed
-- along with its test hotel by a follow-up cleanup migration once done.
update auth.users set email_confirmed_at = now()
where email = 'theme-verify@mailinator.com' and email_confirmed_at is null;
