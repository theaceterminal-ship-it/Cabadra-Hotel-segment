// Edge Function: property-guest-email
//
// The owner's tools for a hotel's guest emails. Signed-in owner of the property only.
//
//   { action: 'test', propertyId, kind }          sends a sample to the owner's own email address
//   { action: 'domain_start', propertyId, domain, localPart }   adds the hotel's own domain; returns the DNS records to add
//   { action: 'domain_verify', propertyId }       asks the email service to check the records, saves the result
//   { action: 'domain_local', propertyId, localPart }           changes the part before the @ (bookings@, hello@)
//   { action: 'domain_remove', propertyId }       goes back to "Hotel via Cabadra"
//
// Domain state lives in property_email_domains, which only this function writes, so a hotel
// can't name a domain it hasn't proven it owns. Until a domain is verified, every email goes
// out as "Hotel via Cabadra" (guest-emails-send does that).
//
// Deploy: supabase functions deploy property-guest-email
// Secrets: RESEND_API_KEY (domains need a full-access key, not a send-only one), RESEND_FROM

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, json } from '../_shared/razorpay.ts';
import { type GuestEmailContext, type GuestEmailKind, pickSenders, renderGuestEmail, sendWithResend } from '../_shared/guestEmails.ts';

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const LOCAL_RE = /^[a-z0-9._-]{1,40}$/;

async function resend(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data as Record<string, unknown> };
}
function resendProblem(r: { status: number; data: Record<string, unknown> }): string {
  const msg = String(r.data.message ?? '');
  if (r.status === 401 || r.status === 403 || /restricted|permission/i.test(msg)) return 'The email key set for Cabadra can only send, not manage domains. Ask support to switch it to a full-access key.';
  return msg || `The email service said ${r.status}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  let body: { action?: string; propertyId?: string; kind?: GuestEmailKind; domain?: string; localPart?: string };
  try { body = await req.json(); } catch { return json({ success: false, message: 'Invalid JSON body' }, 400); }
  const propertyId = body.propertyId?.trim();
  if (!propertyId) return json({ success: false, message: 'propertyId is required' }, 400);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ success: false, message: 'Missing Authorization header' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return json({ success: false, message: 'Not signed in' }, 401);
  const { data: ownerRows } = await callerClient.from('staff_properties').select('role').eq('property_id', propertyId).eq('role', 'owner').limit(1);
  if (!ownerRows || ownerRows.length === 0) return json({ success: false, message: 'Only an owner of this property can do this' }, 403);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // ---- a sample email to the owner ---------------------------------------------------
  if (body.action === 'test') {
    const kind: GuestEmailKind = body.kind === 'checkout_thanks' ? 'checkout_thanks' : body.kind === 'pre_arrival' ? 'pre_arrival' : 'booking_confirmation';
    const to = userData.user.email;
    const resendFrom = Deno.env.get('RESEND_FROM');
    if (!to || !resendFrom) return json({ success: false, message: 'No email address to send the sample to.' });
    const { data: ok } = await admin.rpc('system_rate_limit', { p_key: `guest_email_test:${propertyId}`, p_max: 6, p_window_seconds: 3600 });
    if (ok === false) return json({ success: false, message: 'That is enough samples for now. Try again in an hour.' }, 429);

    const { data: p } = await admin.from('properties').select('id, name, location, image, currency, guest_emails_enabled, billing_address, billing_phone, billing_email, maps_url, check_in_time, check_out_time, welcome_note, thanks_note, google_review_url').eq('id', propertyId).single();
    if (!p) return json({ success: false, message: 'Property not found' }, 404);
    const { data: d } = await admin.from('property_email_domains').select('domain, local_part').eq('property_id', propertyId).eq('status', 'verified').maybeSingle();
    const day = (n: number, h: number) => { const t = new Date(); t.setUTCDate(t.getUTCDate() + n); t.setUTCHours(h, 0, 0, 0); return t.toISOString(); };
    const ctx: GuestEmailContext = {
      reservation: { id: crypto.randomUUID(), status: kind === 'checkout_thanks' ? 'checked_out' : 'upcoming', source: 'built_in', booking_ref: 'SAMPLE-0001', check_in: kind === 'checkout_thanks' ? day(-3, 8) : day(7, 8), check_out: kind === 'checkout_thanks' ? day(0, 5) : day(10, 5), party_size: 2, rate_per_night: 4500 },
      guest: { name: 'Sample Guest', email: to },
      room: { number: '000', type: 'Deluxe Room' },
      property: { id: p.id, name: p.name, location: p.location, image: p.image, currency: p.currency, enabled: true, address: p.billing_address ?? p.location, phone: p.billing_phone, reply_to: p.billing_email, maps_url: p.maps_url, check_in_time: p.check_in_time, check_out_time: p.check_out_time, welcome_note: p.welcome_note, thanks_note: p.thanks_note, google_review_url: p.google_review_url },
      domain: d ?? null,
    };
    const site = (Deno.env.get('SITE_URL') ?? 'https://hotel.churmuri.com').replace(/\/+$/, '');
    // Sample buttons go to the site's front page, not to a real pre-order.
    const email = renderGuestEmail(kind, ctx, [{ url: site, name: 'Hot tomato soup', price: 180 }, { url: site, name: 'Masala chai', price: 60 }, { url: site, name: 'Veg momos', price: 150 }]);
    email.subject = `[Sample] ${email.subject}`;
    let lastError = '';
    for (const s of pickSenders(ctx, resendFrom)) {
      try {
        await sendWithResend({ from: s.from, to, replyTo: ctx.property.reply_to, email });
        return json({ success: true, sentTo: to, via: s.via });
      } catch (err) { lastError = err instanceof Error ? err.message : 'send failed'; }
    }
    return json({ success: false, message: `The sample could not be sent (${lastError}).` });
  }

  // ---- the hotel's own domain ------------------------------------------------------------
  if (body.action === 'domain_start') {
    const domain = (body.domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    const local = (body.localPart ?? 'bookings').trim().toLowerCase();
    if (!DOMAIN_RE.test(domain)) return json({ success: false, message: 'Enter your domain without the @, like hotelname.com' });
    if (!LOCAL_RE.test(local)) return json({ success: false, message: 'The part before the @ can use letters, numbers, dots and dashes.' });
    if (/(^|\.)(gmail|googlemail|yahoo|outlook|hotmail|icloud|aol|proton|protonmail)\.[a-z.]+$/.test(domain)) {
      return json({ success: false, message: 'That is a free mailbox address. Mail can only be sent from a domain you own, like hotelname.com.' });
    }
    const { data: taken } = await admin.from('property_email_domains').select('property_id').eq('domain', domain).neq('property_id', propertyId).maybeSingle();
    if (taken) return json({ success: false, message: 'That domain is already set up for another hotel.' });

    // Already registered by us (a retry)? Reuse it.
    const { data: mine } = await admin.from('property_email_domains').select('resend_domain_id, domain').eq('property_id', propertyId).maybeSingle();
    if (mine && mine.domain !== domain && mine.resend_domain_id) await resend('DELETE', `/domains/${mine.resend_domain_id}`);

    let created = await resend('POST', '/domains', { name: domain });
    if (!created.ok && /already|exist|registered/i.test(String(created.data.message ?? ''))) {
      const list = await resend('GET', '/domains');
      const found = ((list.data.data as { id: string; name: string }[] | undefined) ?? []).find(x => x.name === domain);
      if (found) created = await resend('GET', `/domains/${found.id}`);
    }
    if (!created.ok) return json({ success: false, message: resendProblem(created) });
    const row = {
      property_id: propertyId, domain, local_part: local, resend_domain_id: String(created.data.id ?? ''),
      status: String(created.data.status ?? 'pending'), records: (created.data.records as unknown[]) ?? [], last_error: null, verified_at: null, checked_at: new Date().toISOString(),
    };
    const { error } = await admin.from('property_email_domains').upsert(row, { onConflict: 'property_id' });
    if (error) return json({ success: false, message: 'Could not save the domain. Please try again.' }, 500);
    return json({ success: true, status: row.status });
  }

  if (body.action === 'domain_verify') {
    const { data: row } = await admin.from('property_email_domains').select('resend_domain_id').eq('property_id', propertyId).maybeSingle();
    if (!row?.resend_domain_id) return json({ success: false, message: 'No domain is set up yet.' });
    await resend('POST', `/domains/${row.resend_domain_id}/verify`);
    const got = await resend('GET', `/domains/${row.resend_domain_id}`);
    if (!got.ok) return json({ success: false, message: resendProblem(got) });
    const status = String(got.data.status ?? 'pending');
    await admin.from('property_email_domains').update({
      status, records: (got.data.records as unknown[]) ?? [], checked_at: new Date().toISOString(),
      verified_at: status === 'verified' ? new Date().toISOString() : null,
      last_error: status === 'failed' ? 'The records were not found. DNS changes can take a while to spread.' : null,
    }).eq('property_id', propertyId);
    return json({ success: true, status });
  }

  if (body.action === 'domain_local') {
    const local = (body.localPart ?? '').trim().toLowerCase();
    if (!LOCAL_RE.test(local)) return json({ success: false, message: 'The part before the @ can use letters, numbers, dots and dashes.' });
    await admin.from('property_email_domains').update({ local_part: local }).eq('property_id', propertyId);
    return json({ success: true });
  }

  if (body.action === 'domain_remove') {
    const { data: row } = await admin.from('property_email_domains').select('resend_domain_id').eq('property_id', propertyId).maybeSingle();
    if (row?.resend_domain_id) await resend('DELETE', `/domains/${row.resend_domain_id}`);
    await admin.from('property_email_domains').delete().eq('property_id', propertyId);
    return json({ success: true });
  }

  return json({ success: false, message: 'Unknown action' }, 400);
});
