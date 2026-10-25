// Edge Function: partner-create-order
//
// Step one of a business paying for its listing (or a featured spot) from
// its partner page. The business is the signed-in account's own
// (partnerId), or the one a partner page link opens while it has no
// account yet (token): partner_resolve (0085) decides, as the caller. The
// price comes from partner_settings via system_create_partner_order
// (service_role only), never from the browser. Then a Razorpay order is
// created for it.
//
// Deploy: supabase functions deploy partner-create-order
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (see ../_shared/razorpay.ts)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, json, razorpay, razorpayKeys } from '../_shared/razorpay.ts';
import { resolvePartner } from '../_shared/partnerAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  const keys = razorpayKeys();
  if (!keys) return json({ success: false, message: 'Online payments are not set up yet. Contact us to pay.' }, 500);

  let body: { token?: string; partnerId?: string; kind?: string; months?: number };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON body' }, 400);
  }
  const partnerId = await resolvePartner(req, body);
  if (typeof partnerId !== 'string') return partnerId;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.rpc('system_create_partner_order', {
    p_partner_id: partnerId,
    p_kind: body.kind,
    p_months: body.months,
  });
  if (error) return json({ success: false, message: error.message }, 400);
  const quote = data as { orderId: string; amountPaise: number; partnerName: string; email: string | null; phone: string | null };

  let order: { id: string; amount: number; currency: string };
  try {
    order = await razorpay(keys, 'POST', '/orders', {
      amount: quote.amountPaise,
      currency: 'INR',
      receipt: quote.orderId,
      notes: { partner_order_id: quote.orderId, partner: quote.partnerName, kind: body.kind ?? '', months: String(body.months) },
    });
  } catch (err) {
    return json({ success: false, message: err instanceof Error ? err.message : 'Could not create the Razorpay order' }, 502);
  }

  const { error: updateErr } = await admin.from('partner_orders').update({ razorpay_order_id: order.id }).eq('id', quote.orderId);
  if (updateErr) return json({ success: false, message: updateErr.message }, 500);

  return json({
    success: true,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: keys.keyId,
    prefill: { name: quote.partnerName, email: quote.email ?? undefined, contact: quote.phone ?? undefined },
  });
});
