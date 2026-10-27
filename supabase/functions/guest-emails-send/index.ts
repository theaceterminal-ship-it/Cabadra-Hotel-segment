// Edge Function: guest-emails-send
//
// Sends the guest emails queued on guest_email_outbox (0092): booking confirmations and
// post-checkout thank-yous. Called every minute by pg_cron (only when something is due),
// not by the app: deployed with --no-verify-jwt and it requires the x-cron-secret header
// to match CRON_SECRET (the same value as the Vault secret id_document_purge_cron_secret).
//
// Each row is claimed first, so overlapping runs never send twice. A failure is retried
// (10, 20 minutes) and then marked failed. A hotel's own verified domain is tried first;
// if that send fails, the same email goes out as "Hotel via Cabadra".
//
// Deploy: supabase functions deploy guest-emails-send --no-verify-jwt
// Secrets: CRON_SECRET, RESEND_API_KEY, RESEND_FROM

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { type GuestEmailContext, type GuestEmailKind, pickSenders, renderGuestEmail, sendWithResend } from '../_shared/guestEmails.ts';

const BATCH = 20;
const MAX_ATTEMPTS = 3;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const validEmail = (e?: string | null) => !!e && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);
  const cronSecret = Deno.env.get('CRON_SECRET');
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!cronSecret || !safeEqual(given, cronSecret)) return json({ message: 'Forbidden' }, 403);

  const resendFrom = Deno.env.get('RESEND_FROM');
  if (!resendFrom || !Deno.env.get('RESEND_API_KEY')) return json({ message: 'RESEND_API_KEY / RESEND_FROM not set' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: claimed, error: claimErr } = await admin.rpc('system_claim_guest_emails', { p_limit: BATCH });
  if (claimErr) {
    console.error('guest-emails-send claim failed:', claimErr.message);
    return json({ message: 'Could not read the queue' }, 500);
  }

  const done = (id: number, status: string, error?: string, via?: string, retryMinutes?: number) =>
    admin.rpc('system_guest_email_done', { p_id: id, p_status: status, p_error: error ?? null, p_via: via ?? null, p_retry_minutes: retryMinutes ?? null });

  const tally = { sent: 0, skipped: 0, retried: 0, failed: 0 };
  for (const row of (claimed ?? []) as { id: number; kind: GuestEmailKind; reservation_id: string; attempts: number }[]) {
    try {
      const { data: ctx, error } = await admin.rpc('system_guest_email_context', { p_reservation_id: row.reservation_id });
      if (error || !ctx) { await done(row.id, 'failed', error?.message ?? 'stay not found'); tally.failed++; continue; }
      const c = ctx as GuestEmailContext;

      if (!c.property.enabled) { await done(row.id, 'skipped', 'guest emails are switched off for this hotel'); tally.skipped++; continue; }
      if (!validEmail(c.guest.email)) { await done(row.id, 'skipped', 'no email address on the booking'); tally.skipped++; continue; }
      if (row.kind === 'booking_confirmation' && c.reservation.status !== 'upcoming') { await done(row.id, 'skipped', 'the stay is no longer upcoming'); tally.skipped++; continue; }
      if (row.kind === 'checkout_thanks' && c.reservation.status !== 'checked_out') { await done(row.id, 'skipped', 'the stay is not checked out'); tally.skipped++; continue; }

      const email = renderGuestEmail(row.kind, c);
      const senders = pickSenders(c, resendFrom);
      let sentVia: string | null = null;
      let lastError = '';
      for (const s of senders) {
        try {
          await sendWithResend({ from: s.from, to: c.guest.email!, replyTo: c.property.reply_to, email });
          sentVia = s.via;
          if (s.via === 'cabadra' && senders.length > 1) lastError = `own domain failed, sent the Cabadra way: ${lastError}`;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'send failed';
        }
      }
      if (sentVia) {
        await done(row.id, 'sent', lastError || undefined, sentVia);
        tally.sent++;
      } else if (row.attempts >= MAX_ATTEMPTS) {
        await done(row.id, 'failed', lastError);
        tally.failed++;
      } else {
        await done(row.id, 'retry', lastError, undefined, row.attempts * 10);
        tally.retried++;
      }
    } catch (err) {
      console.error('guest-emails-send row failed:', row.id, err instanceof Error ? err.message : err);
      await done(row.id, row.attempts >= MAX_ATTEMPTS ? 'failed' : 'retry', err instanceof Error ? err.message : 'error', undefined, row.attempts * 10);
    }
    await sleep(600); // the email service allows only a couple of sends a second
  }
  return json({ ok: true, ...tally });
});
