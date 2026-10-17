-- Migration 0061: Add beds_description and bathroom_details to rooms
-- Allows hotels to specify bed counts, bed types, and bathroom amenities (Jacuzzi, En-suite, Shower)
-- for every room category.

alter table rooms add column if not exists beds_description text;
alter table rooms add column if not exists bathroom_details text;
