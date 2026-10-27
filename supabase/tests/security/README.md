# Security tests

An attack suite that runs against a local Postgres built from the real migrations. Real database roles
(`anon`, a receptionist, an owner, another hotel's receptionist, a guest holding a link) try to cheat:
rewrite a bill line, delete a reservation, change a price, forge the audit log, flood the chat, read tables
they shouldn't. Each line prints `PASS` when the attempt is refused (or when a legitimate action still works).

```bash
createdb -h 127.0.0.1 -p 54329 -U postgres sec
psql -h 127.0.0.1 -p 54329 -U postgres -d sec -q -f supabase/tests/security/00_supabase_stubs.sql   # stands in for Supabase's auth/storage/vault
for f in supabase/migrations/*.sql; do   # pg_cron / pg_net lines are stubbed, so skip the CREATE EXTENSION for them
  sed -e '/create extension if not exists pg_cron;/d' -e '/create extension if not exists pg_net;/d' "$f" | psql -h 127.0.0.1 -p 54329 -U postgres -d sec -q
done                                                                                                   # (0033, 0068 and 0072 print harmless errors here)
psql -h 127.0.0.1 -p 54329 -U postgres -d sec -q -f supabase/tests/security/10_fixtures.sql
supabase/tests/security/attack.sh sec                                                                  # last line: pass=N fail=0
```

Run it after any migration that touches policies, grants, guards or the guest functions. A `FAIL` means a door
that should be shut is open (or a legitimate action broke). Run it before the hardening migration (0087) and a
large share of the attacks succeed; that is the point of the suite.

Section H checks the blocked-attempts log (0089): each refused action must leave a row in `security_events`, written over a separate connection so it survives the rollback.
