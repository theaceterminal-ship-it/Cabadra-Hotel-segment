-- rate_limit_hits (0020) was created without row-level security, and
-- Supabase's default grants gave anon and authenticated full access
-- through the API. Anyone holding the public anon key could delete hits
-- (switching off the brute-force limit on guest room QR lookups), insert
-- fake ones (locking real guests out of a room's guest app), or read
-- which rooms were scanned when.
--
-- Only check_rate_limit() needs this table. It is SECURITY DEFINER, owned
-- by the table owner, so it keeps working with RLS on and no policies;
-- nothing else, client or server, should touch it.
-- Apply after 0001-0070.

alter table rate_limit_hits enable row level security;

revoke all on table rate_limit_hits from anon, authenticated;
