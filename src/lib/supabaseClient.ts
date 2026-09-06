import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False until .env.local has real values. Pages check this to show a setup message instead of a blank crash. */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // Loud on purpose — a silent misconfigured client fails every query with
  // a cryptic network error instead of this one clear message at startup.
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project values (Project Settings > API).'
  );
}

// The anon/publishable key is safe to ship to the browser by design — every
// table has RLS enabled (see supabase/migrations/0001_init.sql), so this
// key alone grants nothing beyond what a signed-in staff member's own rows
// allow, plus the three guest_* RPC functions. Never put the service_role
// key here or in any VITE_ env var — that key bypasses RLS entirely and
// must only ever be used server-side (e.g. from the Supabase SQL editor,
// or a future admin script run outside the browser).
//
// createClient() throws synchronously on a missing/malformed URL, which
// would otherwise crash the entire app (including pages that don't need
// Supabase, like the landing page) before React even renders — so an
// unconfigured project falls back to harmless placeholder values here, and
// isSupabaseConfigured is what callers check before actually using it.
export const supabase = createClient(
  isSupabaseConfigured ? url : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? anonKey : 'placeholder-anon-key'
);
