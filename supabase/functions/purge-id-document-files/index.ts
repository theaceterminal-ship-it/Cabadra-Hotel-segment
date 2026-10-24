// Edge Function: purge-id-document-files
//
// Deletes guest ID photos from Cloudinary once the database has let go of
// them (id_document_deletions, filled by the trigger in
// 0068_id_document_file_deletion.sql). Called once a day by pg_cron, not
// by the app: it's deployed with --no-verify-jwt and instead requires the
// x-cron-secret header to match CRON_SECRET.
//
// Deploy: supabase functions deploy purge-id-document-files --no-verify-jwt
// Secrets: CRON_SECRET (same value as the Vault secret
//          id_document_purge_cron_secret), CLOUDINARY_API_KEY,
//          CLOUDINARY_API_SECRET, optional CLOUDINARY_CLOUD_NAME.
// Until the Cloudinary keys are set, files stay queued and are deleted on
// the first run after they are.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const BATCH = 100;
const MAX_ATTEMPTS = 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * https://res.cloudinary.com/<cloud>/image/upload/[<transforms>/][v123/]<public_id>.<ext>
 * → public_id, or null when the URL isn't an upload in this cloud (e.g. a
 * link someone pasted instead of uploading).
 */
function publicIdFromUrl(url: string, cloudName: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'res.cloudinary.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  // [cloud, 'image', 'upload', ...rest]
  if (parts[0] !== cloudName || parts[1] !== 'image' || parts[2] !== 'upload') return null;
  let rest = parts.slice(3);
  const versionAt = rest.findIndex(p => /^v\d+$/.test(p));
  if (versionAt >= 0) rest = rest.slice(versionAt + 1);
  if (rest.length === 0) return null;
  const last = rest[rest.length - 1].replace(/\.[a-z0-9]+$/i, '');
  return [...rest.slice(0, -1), last].join('/');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  const cronSecret = Deno.env.get('CRON_SECRET');
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!cronSecret || !safeEqual(given, cronSecret)) return json({ message: 'Forbidden' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: rows, error } = await admin
    .from('id_document_deletions')
    .select('id, url, attempts')
    .is('deleted_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('queued_at')
    .limit(BATCH);
  if (error) return json({ message: error.message }, 500);
  if (!rows?.length) return json({ processed: 0 });

  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME') ?? 'dkgv4k0px';
  if (!apiKey || !apiSecret) {
    return json({ processed: 0, pending: rows.length, message: 'CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET not set; files stay queued.' });
  }
  const auth = `Basic ${btoa(`${apiKey}:${apiSecret}`)}`;

  const summary = { deleted: 0, not_found: 0, skipped: 0, failed: 0 };

  for (const row of rows) {
    const publicId = publicIdFromUrl(row.url, cloudName);
    if (!publicId) {
      await admin.from('id_document_deletions')
        .update({ deleted_at: new Date().toISOString(), result: 'skipped_not_cloudinary' })
        .eq('id', row.id);
      summary.skipped++;
      continue;
    }

    try {
      const params = new URLSearchParams({ invalidate: 'true' });
      params.append('public_ids[]', publicId);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/image/upload?${params}`,
        { method: 'DELETE', headers: { Authorization: auth } },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? `Cloudinary returned ${res.status}`);

      const outcome = body?.deleted?.[publicId];
      if (outcome !== 'deleted' && outcome !== 'not_found') throw new Error(`Unexpected result: ${JSON.stringify(outcome)}`);

      await admin.from('id_document_deletions')
        .update({ deleted_at: new Date().toISOString(), result: outcome, last_error: null })
        .eq('id', row.id);
      summary[outcome === 'deleted' ? 'deleted' : 'not_found']++;
    } catch (err) {
      await admin.from('id_document_deletions')
        .update({ attempts: row.attempts + 1, last_error: err instanceof Error ? err.message : String(err) })
        .eq('id', row.id);
      summary.failed++;
    }
  }

  return json({ processed: rows.length, ...summary });
});
