-- Rooms had no notion of how many guests they sleep — fine while the only
-- way to occupy one was clicking a specific room tile you already knew
-- fit, but the new "New Booking" search flow needs something real to
-- filter on ("how many people?"). Defaults to 2 (the common case) so
-- existing rooms don't need backfilling to keep working. Apply after
-- 0001-0013.

alter table rooms add column if not exists max_occupancy integer not null default 2;
