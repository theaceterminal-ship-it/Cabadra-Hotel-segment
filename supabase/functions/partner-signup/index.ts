// Edge Function: partner-signup
//
// A local business applies to be listed, from the website's /partners
// page. No account: the application is checked and saved by
// system_partner_apply (0084, service_role only) as a pending partner, and
// the business gets an email with its private partner page link, where it
// can follow the review and, once approved, pay. Three applications an
// hour per IP address (stored only as a salted hash).
//
// Deploy: supabase functions deploy partner-signup
// Secrets: RESEND_API_KEY, RESEND_FROM (see ../_shared/partnerEmail.ts)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, json } from '../_shared/razorpay.ts';
import { inBackground, partnerPageUrl, sendPartnerEmail } from '../_shared/partnerEmail.ts';

async function sha256(s: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  let body: { application?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON body' }, 400);
  }
  const application = body.application;
  if (!application || typeof application !== 'object') return json({ success: false, message: 'Missing application' }, 400);

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
  const ipHash = await sha256(`partner-signup:${Deno.env.get('SUPABASE_URL')}:${ip}`);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.rpc('system_partner_apply', { p: application, p_ip_hash: ipHash });
  if (error) return json({ success: false, message: error.message }, 400);
  const row = data as { id: string; name: string; email: string; ownerName: string | null; portalToken: string };

  inBackground(sendPartnerEmail(row.email, {
    subject: `We’ve got your application: ${row.name}`,
    paragraphs: [
      `Hi${row.ownerName ? ` ${row.ownerName}` : ''},`,
      `Thanks for applying to list ${row.name} in the Cabadra guest app. We check every business by hand, usually within two working days, and email you as soon as it’s done.`,
      'Once you’re approved, you pay for your listing on your partner page, and guests staying at hotels near you start seeing it straight away.',
    ],
    button: { label: 'Open your partner page', href: partnerPageUrl(row.portalToken) },
    footnote: 'Keep this email: the button is your private link to your partner page. Anyone with it can see your listing and guests’ requests.',
  }));

  return json({ success: true, portalToken: row.portalToken });
});
