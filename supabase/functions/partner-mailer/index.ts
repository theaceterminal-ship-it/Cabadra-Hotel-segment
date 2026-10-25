// Edge Function: partner-mailer
//
// Every email to partner businesses that isn't a direct reply to them:
//   { job: 'request', requestId } a guest sent a booking request (from the
//                                 partner_requests insert trigger, 0084);
//   { job: 'review', partnerId }  an admin approved or rejected an
//                                 application (partners status trigger);
//   { job: 'applied', partnerId } a signed-in business applied (0085);
//   { job: 'changes', partnerId } an admin reviewed a listing edit (0085);
//   { job: 'daily' }              pg_cron at 10:00 IST: renewal reminders
//                                 5 days and 1 day before the listing runs
//                                 out, a notice the day after it has, a
//                                 heads-up 3 days before a featured spot
//                                 ends, and on the 1st, last month's report.
// Each email is claimed in partner_email_log first, so a retry or a second
// run never sends it twice; a failed send gives the claim back.
//
// Not called by the app: deployed with --no-verify-jwt and instead
// requires the x-cron-secret header to match CRON_SECRET (the same secret
// purge-id-document-files uses; the Vault side is
// id_document_purge_cron_secret).
//
// Deploy: supabase functions deploy partner-mailer --no-verify-jwt
// Secrets: CRON_SECRET, RESEND_API_KEY, RESEND_FROM

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { figuresHtml, formatDate, escapeHtml, inr, partnerPageUrl, sendPartnerEmail, type PartnerEmail } from '../_shared/partnerEmail.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

interface Partner {
  id: string;
  name: string;
  email: string | null;
  owner_name: string | null;
  portal_token: string;
  status: string;
  review_note: string | null;
  reviewed_at: string | null;
  paid_until: string | null;
  featured_until: string | null;
  changes_note: string | null;
  changes_reviewed_at: string | null;
  partner_users?: { user_id: string }[];
}
const PARTNER_COLUMNS = 'id, name, email, owner_name, portal_token, status, review_note, reviewed_at, paid_until, featured_until, changes_note, changes_reviewed_at, partner_users(user_id)';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Today's date in India, as yyyy-mm-dd, shifted by `days`. */
function istDate(days = 0) {
  return new Date(Date.now() + 5.5 * 3600_000 + days * 86400_000).toISOString().slice(0, 10);
}

const hi = (p: Partner) => `Hi${p.owner_name ? ` ${p.owner_name.split(/\s+/)[0]}` : ''},`;
const pageButton = (p: Partner, label = 'Open your partner page') => ({ label, href: partnerPageUrl(p.portal_token, (p.partner_users?.length ?? 0) > 0) });

/** Claims, sends, and gives the claim back if sending fails. Returns whether it sent. */
async function sendOnce(admin: Admin, p: Partner, kind: string, ref: string, email: PartnerEmail): Promise<boolean> {
  if (!p.email) return false;
  const { data: claimed, error } = await admin
    .from('partner_email_log')
    .upsert({ partner_id: p.id, kind, ref }, { onConflict: 'partner_id,kind,ref', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(error.message);
  if (!claimed?.length) return false;
  try {
    await sendPartnerEmail(p.email, email);
    return true;
  } catch (err) {
    await admin.from('partner_email_log').delete().eq('id', claimed[0].id);
    throw err;
  }
}

async function requestJob(admin: Admin, requestId: string) {
  const { data: r } = await admin
    .from('partner_requests')
    .select(`id, guest_name, guest_phone, hotel_name, room_number, message, preferred_time, party_size, notified_at, source, partners!inner(${PARTNER_COLUMNS})`)
    .eq('id', requestId)
    .maybeSingle();
  if (!r || r.notified_at) return { sent: 0 };
  const p = r.partners as Partner;
  const digits = String(r.guest_phone ?? '').replace(/\D/g, '');
  const wa = digits.length === 10 ? `91${digits}` : digits;
  const waText = encodeURIComponent(`Hi ${r.guest_name ?? ''}, this is ${p.name}. We got your request from the Cabadra guest app: "${r.message}".`);
  const sent = await sendOnce(admin, p, 'request', r.id, {
    subject: `${r.source === 'reception' ? 'Booking from the front desk' : 'New guest request'}: ${r.guest_name ?? 'a guest'} at ${r.hotel_name}`,
    paragraphs: [
      hi(p),
      r.source === 'reception'
        ? `The front desk at ${r.hotel_name} is booking ${p.name} for one of their guests, who asked them to and agreed to share their details so you can reply.`
        : `A guest staying nearby asked ${p.name} for something through the Cabadra guest app. They agreed to share their details so you can reply.`,
      { html: `<div style="background:#f4f5f2;border-radius:16px;padding:16px 18px;margin:0 0 16px;font-size:15px;line-height:1.5">“${escapeHtml(r.message)}”</div>` },
      figuresHtml([
        ['Guest', r.guest_name ?? 'Guest'],
        ['Phone', r.guest_phone ?? ''],
        ['Staying at', `${r.hotel_name}${r.room_number ? `, room ${r.room_number}` : ''}`],
        ...(r.preferred_time ? [['When', r.preferred_time] as [string, string]] : []),
        ...(r.party_size ? [['People', String(r.party_size)] as [string, string]] : []),
      ]),
      { html: `<p style="margin:0 0 14px;font-size:15px"><a href="https://wa.me/${wa}?text=${waText}" style="color:#111;font-weight:600">WhatsApp ${escapeHtml(r.guest_name ?? 'the guest')}</a> &nbsp;·&nbsp; <a href="tel:${escapeHtml(r.guest_phone ?? '')}" style="color:#111;font-weight:600">Call</a></p>` },
    ],
    button: pageButton(p, 'Accept or decline on your partner page'),
    footnote: 'Marking it accepted or declined on your partner page lets the guest see your answer in their app.',
  });
  if (sent) await admin.from('partner_requests').update({ notified_at: new Date().toISOString() }).eq('id', r.id);
  return { sent: sent ? 1 : 0 };
}

async function reviewJob(admin: Admin, partnerId: string) {
  const { data: p } = await admin.from('partners').select(PARTNER_COLUMNS).eq('id', partnerId).maybeSingle();
  if (!p || !p.email || !['approved', 'rejected'].includes(p.status)) return { sent: 0 };
  const partner = p as Partner;
  const { data: settings } = await admin.from('partner_settings').select('listing_fee_monthly').eq('id', 1).maybeSingle();
  const email: PartnerEmail = partner.status === 'approved'
    ? {
      subject: `You’re approved: ${partner.name}`,
      paragraphs: [
        hi(partner),
        `Good news: ${partner.name} is approved for the Cabadra guest app.`,
        `Pay for your listing on your partner page${settings ? ` (${inr(Number(settings.listing_fee_monthly))} a month)` : ''} and it goes live for guests at hotels near you straight away.`,
      ],
      button: pageButton(partner, 'Pay and go live'),
    }
    : {
      subject: `About your application: ${partner.name}`,
      paragraphs: [
        hi(partner),
        `Thanks for applying to list ${partner.name}. We can’t list it right now.`,
        ...(partner.review_note ? [`Our note: ${partner.review_note}`] : []),
        'If something has changed, or you think we got it wrong, reply to this email.',
      ],
    };
  const sent = await sendOnce(admin, partner, `review_${partner.status}`, partner.reviewed_at ?? partner.status, email);
  return { sent: sent ? 1 : 0 };
}

async function appliedJob(admin: Admin, partnerId: string) {
  const { data: p } = await admin.from('partners').select(PARTNER_COLUMNS).eq('id', partnerId).maybeSingle();
  if (!p || !p.email) return { sent: 0 };
  const partner = p as Partner;
  const sent = await sendOnce(admin, partner, 'applied', partner.id, {
    subject: `We’ve got your application: ${partner.name}`,
    paragraphs: [
      hi(partner),
      `Thanks for applying to list ${partner.name} in the Cabadra guest app. We check every business by hand, usually within two working days, and email you as soon as it’s done.`,
      'Once you’re approved, pay for your listing on your partner page, and guests staying at hotels near you start seeing it straight away.',
    ],
    button: pageButton(partner),
    footnote: 'Sign in with the same Google account (or email and password) to open your partner page any time.',
  });
  return { sent: sent ? 1 : 0 };
}

async function changesJob(admin: Admin, partnerId: string) {
  const { data: p } = await admin.from('partners').select(PARTNER_COLUMNS).eq('id', partnerId).maybeSingle();
  if (!p || !p.email || !p.changes_reviewed_at) return { sent: 0 };
  const partner = p as Partner;
  const accepted = !partner.changes_note;
  const sent = await sendOnce(admin, partner, accepted ? 'changes_live' : 'changes_declined', partner.changes_reviewed_at!, {
    subject: accepted ? `Your changes are live: ${partner.name}` : `About your listing changes: ${partner.name}`,
    paragraphs: accepted
      ? [hi(partner), `We’ve checked your edits to ${partner.name}. Guests see the new version from now on.`]
      : [hi(partner), `We couldn’t accept your latest edits to ${partner.name}, so guests still see the previous version.`, `Our note: ${partner.changes_note}`],
    button: pageButton(partner),
  });
  return { sent: sent ? 1 : 0 };
}

async function monthlyReport(admin: Admin, p: Partner, from: string, to: string, label: string) {
  const { data: m, error } = await admin.rpc('system_partner_month', { p_partner_id: p.id, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const contacts = m.calls + m.whatsapps + m.directions + m.codes;
  return sendOnce(admin, p, 'report', from.slice(0, 7), {
    subject: `${p.name} in ${label}: ${m.views} guest views`,
    paragraphs: [
      hi(p),
      `Here’s how ${p.name} did in the Cabadra guest app in ${label}.`,
      figuresHtml([
        ['Guests who saw your listing', String(m.views)],
        ['Opened it', String(m.opens)],
        ['Called you', String(m.calls)],
        ['WhatsApped you', String(m.whatsapps)],
        ['Asked for directions', String(m.directions)],
        ['Showed your offer code', String(m.codes)],
        ['Sent you a request', String(m.requests)],
        ['Hotels it showed at', String(m.hotels)],
        ...(m.rating?.count ? [['Guest rating', `${m.rating.average} ★ from ${m.rating.count}`] as [string, string]] : []),
      ]),
      contacts > 0
        ? `That’s ${contacts} guest${contacts === 1 ? '' : 's'} who got in touch or headed your way.`
        : 'A clear offer (like 10% off for hotel guests) is the quickest way to turn views into visits.',
      ...(p.paid_until ? [`Your listing is paid until ${formatDate(p.paid_until)}.`] : []),
    ],
    button: pageButton(p),
  });
}

async function dailyJob(admin: Admin) {
  const today = istDate();
  const { data: partners, error } = await admin
    .from('partners')
    .select(PARTNER_COLUMNS)
    .eq('status', 'approved')
    .eq('active', true)
    .not('email', 'is', null);
  if (error) throw new Error(error.message);
  let sent = 0;
  const failures: string[] = [];
  const attempt = async (f: () => Promise<boolean>, who: string) => {
    try {
      if (await f()) sent++;
    } catch (err) {
      failures.push(`${who}: ${err instanceof Error ? err.message : err}`);
    }
  };

  for (const p of partners as Partner[]) {
    if (p.paid_until === istDate(5) || p.paid_until === istDate(1)) {
      const days = p.paid_until === istDate(1) ? 1 : 5;
      await attempt(() => sendOnce(admin, p, `renew${days}`, p.paid_until!, {
        subject: days === 1 ? `${p.name} comes off the guest app tomorrow night` : `Your listing ends in ${days} days: ${p.name}`,
        paragraphs: [
          hi(p),
          `Your ${p.name} listing in the Cabadra guest app is paid until ${formatDate(p.paid_until!)}. Renew on your partner page to keep showing to guests without a gap; the new months start when the current ones end.`,
        ],
        button: pageButton(p, 'Renew now'),
      }), p.name);
    }
    if (p.paid_until === istDate(-1)) {
      await attempt(() => sendOnce(admin, p, 'lapsed', p.paid_until!, {
        subject: `${p.name} is no longer showing to guests`,
        paragraphs: [
          hi(p),
          `Your listing ran out yesterday, so guests at hotels near you can’t see ${p.name} any more. Pay on your partner page and it’s back straight away.`,
        ],
        button: pageButton(p, 'Renew and go live'),
      }), p.name);
    }
    if (p.featured_until === istDate(3) && p.paid_until && p.paid_until >= istDate(3)) {
      await attempt(() => sendOnce(admin, p, 'featured3', p.featured_until!, {
        subject: `Your featured spot ends in 3 days: ${p.name}`,
        paragraphs: [hi(p), `${p.name} is featured at the front of the guest app until ${formatDate(p.featured_until!)}. Extend it on your partner page to stay first.`],
        button: pageButton(p, 'Extend featured'),
      }), p.name);
    }
  }

  // The 1st: last month's report, for anyone who was listed during it.
  if (today.endsWith('-01')) {
    const first = new Date(`${today}T00:00:00Z`);
    first.setUTCMonth(first.getUTCMonth() - 1);
    const from = first.toISOString().slice(0, 10);
    const to = istDate(-1);
    const label = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    for (const p of partners as Partner[]) {
      if (!p.paid_until || p.paid_until < from) continue;
      await attempt(() => monthlyReport(admin, p, from, to, label), p.name);
    }
  }
  if (failures.length) console.error('partner-mailer failures:', failures.join(' | '));
  return { sent, failed: failures.length };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);
  const cronSecret = Deno.env.get('CRON_SECRET');
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!cronSecret || !safeEqual(given, cronSecret)) return json({ message: 'Forbidden' }, 403);

  let body: { job?: string; requestId?: string; partnerId?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    if (body.job === 'request' && body.requestId) return json(await requestJob(admin, body.requestId));
    if (body.job === 'review' && body.partnerId) return json(await reviewJob(admin, body.partnerId));
    if (body.job === 'applied' && body.partnerId) return json(await appliedJob(admin, body.partnerId));
    if (body.job === 'changes' && body.partnerId) return json(await changesJob(admin, body.partnerId));
    if (body.job === 'daily' || !body.job) return json(await dailyJob(admin));
    return json({ message: 'Unknown job' }, 400);
  } catch (err) {
    return json({ message: err instanceof Error ? err.message : 'Failed' }, 500);
  }
});
