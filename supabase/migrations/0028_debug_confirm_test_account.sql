-- One-off, scoped to a single throwaway debug account created while
-- reproducing a support report against provision-access-link — "Confirm
-- email" turned out to be on for this project (LoginPage's error copy
-- assumed it was off), which blocked signing in to test with. Confirms
-- only this one address; touches nothing else.
update auth.users set email_confirmed_at = now()
where email = 'debugtest.accesslinks@mailinator.com' and email_confirmed_at is null;
